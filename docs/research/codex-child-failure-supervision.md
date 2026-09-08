# Codex CLI: delegated-agent failure supervision and hung tools

Research into how OpenAI Codex CLI (`github.com/openai/codex`) handles child-agent
failures, hung shell tools, timeouts, cancellation, and diagnostics — motivated by an
incident where a Pi child agent ran sequential `gh api` searches with no timeout and
its tool batch sat unfinished ~43 min while the coordinator waited, unaware.

**Grounded at revision:** `6478a751fde8884b2fdc76486fe23175a8e795d4` (2026-08-29, local
clone of `openai/codex`). All file links use that commit hash. Claims marked
_inferred_ are reasoning, not implemented guarantees. Note: upstream HEAD has moved
(~`d6489472`, 2026-09-08); this report does not cover changes after the pinned
revision.

---

## 1. Delegation model (v1 `wait_agent` vs v2 activity-based)

Codex's multi-agent tools live in `codex-rs/core/src/tools/handlers/multi_agents*`.
Two generations coexist:

- **v1** (`multi_agents/wait.rs`): `wait_agent(targets, timeout_ms)` blocks until each
  targeted agent reaches a **final status** or the deadline hits. Final statuses come
  from a watch channel on child events (`core/src/agent/status.rs`):
  `TurnComplete{error}` → `Errored(message)`, `TurnComplete` → `Completed(msg)`,
  `TurnAborted` (non-interrupt reasons) → `Errored(...)`, `Error` event →
  `Errored(message)`, `ShutdownComplete` → `Shutdown`.
  https://github.com/openai/codex/blob/6478a751fde8884b2fdc76486fe23175a8e795d4/codex-rs/core/src/agent/status.rs
- **v2** (`multi_agents_v2/wait.rs`): `wait_agent(timeout_ms)` is **activity-based**
  only — it returns `WaitAgentResult { message, timed_out }` where message is one of
  "Wait completed." / "Wait interrupted by new input." / "Wait timed out." It carries
  **no per-agent status or error detail** (`agents_states: HashMap::new()` in the
  emitted turn item).
  https://github.com/openai/codex/blob/6478a751fde8884b2fdc76486fe23175a8e795d4/codex-rs/core/src/tools/handlers/multi_agents_v2/wait.rs
  v2 parents learn of failure via `list_agents` / `send_message` polls instead.

Wait bounds (implemented, `core/src/config/mod.rs`): default wait 30 s
(`DEFAULT_MULTI_AGENT_V2_DEFAULT_WAIT_TIMEOUT_MS = 30_000`), min 10 s, max **1 hour**
(`DEFAULT_MULTI_AGENT_V2_MAX_WAIT_TIMEOUT_MS = 3600 * 1000`, also the hard cap).
Configurable per install, hard-capped at 1 h.
https://github.com/openai/codex/blob/6478a751fde8884b2fdc76486fe23175a8e795d4/codex-rs/core/src/config/mod.rs

### Automatic notification vs wait/poll — the key answer

- **While the parent is inside v1 `wait_agent`**: implemented automatic awareness. The
  status watch channel fires on any child status change _including_ `Errored`, so the
  wait wakes immediately and returns the `Errored(String)` with the child's error
  message; the tool-call item is marked `Failed`.
  (source: `multi_agents/wait.rs`, `wait_tool_call_status`)
- **Outside a wait**: no push notification exists. There is no mechanism that
  interrupts the parent's turn when a child errors or hangs; awareness is
  poll-only (`list_agents`) or wait-only. _Inferred:_ a hung child (still `Running`,
  emitting nothing) is indistinguishable from a slow one — every wait expires at the
  deadline and the parent must re-wait, up to forever.
- This is the closest structural match to the Pi incident: a coordinator that isn't
  actively polling has **no implemented guarantee** of automatic awareness.

## 2. Shell tool timeouts (including network commands)

Implemented in `codex-rs/core/src/exec.rs` and `tools/runtimes/unified_exec.rs`:

- One-shot `exec_command` (the shell path) has an **explicit, mandatory completion
  timeout**: `timeout_ms.unwrap_or(DEFAULT_EXEC_COMMAND_TIMEOUT_MS)` with the default
  **10 000 ms**. The tool schema tells the model: "Maximum command runtime. Defaults
  to 10000 ms." The model may raise it, but a value is always applied.
  https://github.com/openai/codex/blob/6478a751fde8884b2fdc76486fe23175a8e795d4/codex-rs/core/src/tools/handlers/unified_exec/exec_command.rs
- `ExecExpiration` (`exec.rs`) models `Timeout`, `DefaultTimeout`,
  `Cancellation`, `TimeoutOrCancellation`; on expiry the process group is killed.
  Network-restricted commands additionally compose a **network-denial cancellation
  token** (`unified_exec_options`), so a command blocked by network policy is
  cancelled rather than left hanging.
  https://github.com/openai/codex/blob/6478a751fde8884b2fdc76486fe23175a8e795d4/codex-rs/core/src/exec.rs
- **Partial output is preserved on timeout**: `RawExecToolCallOutput` has
  `timed_out: bool` + accumulated stdout/stderr, and the tool content becomes
  `"command timed out after N milliseconds\n<partial output>"`. Timeout exit code is
  conventional `124` (`EXEC_TIMEOUT_EXIT_CODE`).
  https://github.com/openai/codex/blob/6478a751fde8884b2fdc76486fe23175a8e795d4/codex-rs/core/src/tools/mod.rs (`build_content_with_timeout`)
- Grandchildren holding pipes are handled: I/O drains are guarded by
  `IO_DRAIN_TIMEOUT_MS = 2_000` so orphaned FDs can't hang the collector.
- **Gap that maps directly to the incident**: _interactive_ (PTY/background-terminal)
  commands set `ExecCommandLifetime::Interactive` → `completion_timeout = None`, i.e.
  **no completion timeout**; they persist until the model polls via `write_stdin`
  (poll window capped by `background_terminal_max_timeout`, default 300 000 ms) or
  the turn is cancelled. A background terminal running a hung network command can
  stay alive indefinitely by design.
  https://github.com/openai/codex/blob/6478a751fde8884b2fdc76486fe23175a8e795d4/codex-rs/config/src/config_toml.rs (`background_terminal_max_timeout` doc)

_Contrast with Pi:_ Pi's bash tool had no per-call timeout and no forced cap —
exactly the hazard Codex closes with its always-present one-shot timeout.

## 3. Cancellation

- Child threads get the parent's `CancellationToken` lineage:
  `run_codex_thread_interactive(..., cancel_token)` forwards it, and one-shot exec
  creates `cancellation_token.child_token()` with a `drop_guard`
  (`core/src/unified_exec/oneshot.rs`) — cancelling the parent propagates to the
  child's running process, which is `terminate_confirmed()`-killed and reported as
  `"command cancelled"`.
  https://github.com/openai/codex/blob/6478a751fde8884b2fdc76486fe23175a8e795d4/codex-rs/core/src/unified_exec/oneshot.rs
- `interrupt_agent` tool exists for targeted child interruption
  (`core/src/tools/handlers/multi_agents_v2/interrupt_agent.rs`).
- Delegate teardown (`shutdown_delegate` in `codex_delegate.rs`) sends
  `Op::Interrupt` + `Op::Shutdown` and drains events under a **500 ms** timeout —
  best-effort; a wedged delegate can be dropped without full drain.

## 4. Retry exhaustion and failure diagnostics

- Model-API retry policy (`codex-rs/model-provider-info/src/lib.rs`): request retries
  default **4** (cap 100), stream reconnects default **5** (cap 100), stream idle
  timeout default **300 000 ms**. Exhaustion surfaces as a `TurnComplete{error}` /
  `Error` event, which the status mapper converts to
  `AgentStatus::Errored(error.message)` — i.e. **failures do carry a diagnostic
  message string** into parent-visible status. (Depth of that message, e.g. whether
  it includes per-tool call detail, is not guaranteed; it's whatever the error event
  carried.)
  https://github.com/openai/codex/blob/6478a751fde8884b2fdc76486fe23175a8e795d4/codex-rs/model-provider-info/src/lib.rs
- Tool-level errors are `FunctionCallError::RespondToModel(...)` strings fed back to
  the _child's own_ model (e.g. "exec_command failed for `cmd`: {err:?}"), so the
  parent only sees the summarized child outcome unless it inspects rollouts.

## 5. Implemented guarantees vs inference vs gaps

**Implemented guarantees (cited above):**

1. One-shot shell commands always have a timeout (default 10 s, model-raisable);
   process is killed and partial output + "timed out" marker returned.
2. Network-policy denials cancel the command via token, not by hanging.
3. Parent blocked in v1 `wait_agent` wakes immediately on child error with an
   `Errored(String)` diagnostic.
4. Parent cancellation propagates to child processes.
5. All waits are bounded (30 s default, 1 h hard max).

**Inference (reasonable but not source-proven):**

- A child that is `Running` but hung emits nothing, so no parent wait ever returns
  with an error — the parent learns only via repeated timeout/poll.
- The v1 `Errored` message is as diagnostic as the child's error event; no contract
  on its richness.

**Gaps (nothing in the codebase addresses these):**

- No push/async notification of child failure outside an active wait; coordinator
  must poll — the Pi-incident coordinator behavior would look identical in Codex.
- Interactive/background terminals have no completion timeout (only poll-window
  caps), so a hung network command in a background terminal can outlive the incident
  duration seen here.
- v2 `wait_agent` deliberately returns no failure detail, shifting diagnosis to
  explicit polls.

## 6. Implications for Pi (non-prescriptive observations)

- Codex's "always-expiring shell call with partial-output-on-timeout" is the pattern
  that would have surfaced the `gh api` hang at 10 s–N s instead of 43 min.
- Codex's own supervision story does **not** solve "parent automatically aware of a
  hung child"; it only guarantees awareness of children that _error or finish_. A Pi
  design goal of automatic parent awareness of _hangs_ would exceed Codex's
  implemented behavior and needs its own heartbeat/watchdog evidence.

---

_All URLs pinned to `6478a751fde8884b2fdc76486fe23175a8e795d4`. Findings derived
solely from reading source in the local clone at that revision plus the repo's own
doc comments; no external posts were treated as authoritative._
