# OpenCode: Delegated Agent Failure & Hung-Tool Supervision

Research notes, grounded in a read-only local clone at revision
`517ee736b31876e6fc7df57307e78bf790b135a7` (`anomalyco/opencode`, HEAD,
committed 2026-08-28). All paths are relative to the repo root. No files in the
clone were modified. No implementation is proposed here; findings only, plus a
short "ideas applicable to Pi" section at the end.

GitHub permalinks use the pinned revision, e.g.
`https://github.com/anomalyco/opencode/blob/517ee736b31876e6fc7df57307e78bf790b135a7/<path>#L<n>`.

---

## 1. Synchronous vs. asynchronous subagent execution

The `task` tool (`packages/opencode/src/tool/task.ts`) supports two modes.

**Foreground (default, synchronous).** The parent's tool call does not return
until the child session's prompt loop finishes. The tool blocks by racing
`background.wait({ id: nextSession.id })` (the child is _always_ run inside the
BackgroundJob registry) against `background.waitForPromotion` — the promotion
race only lets an interactive user take over a running child, not the parent
loop (task.ts L332–L341).

- task.ts L96–L100: `runInBackground = params.background === true`; gated by
  `RuntimeFlags.experimentalBackgroundSubagents`
  (`OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS=true`), otherwise it fails with
  `Background subagents require OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS=true`
  (L98–L101).
- https://github.com/anomalyco/opencode/blob/517ee736b31876e6fc7df57307e78bf790b135a7/packages/opencode/src/tool/task.ts#L96-L101

**Background (experimental, asynchronous).** `background.start(...)` registers
the child job under the child session ID (L283–L293) and the tool returns
immediately with `state="running"` and instructions to the model not to poll
(`BACKGROUND_STARTED`, L14–L19). Completion is pushed to the parent by
`notifyBackgroundResult` (L256–L264), which waits on the job and forks
`inject(...)` — a synthetic `<task id=... state="completed|error">` message
prompted into the _parent_ session (L227–L254). There is no timeout on
`background.wait` here (the registry supports an optional wait timeout —
`packages/core/src/background-job.ts` L296–L298, `WaitInput.timeout` — but the
task tool does not pass one).

Depth is bounded by `cfg.subagent_depth ?? 1` (L108–L116), so nested subagents
are off by default.

## 2. Parent awareness of child failure

**Guarantee (foreground):** the tool call itself fails. `runTask` (L209–L225)
inspects the finished child:

- If the child's final assistant message carries `info.error`, it fails with
  `Subagent failed (task_id: <childSessionId>): <message>` (L214–L219),
  using `error.data.message` if present, else `error.name`.
- Else if the child's _last tool part_ has `state.status === "error"`, it fails
  with `Subagent failed (task_id: ...): <that tool error>` (L220–L223).
- Otherwise the last text part is returned as output (L224).

In `packages/opencode/src/session/prompt.ts` the parent loop handles the
failure: the task tool result becomes a tool part with
`status: "error", error: "Tool execution failed: <message>"` (prompt.ts
L410–L425), and `Session.Event.Error` is published (L318, L466, L642). The
model then sees the error and can react.

**Guarantee (background):** `notify` explicitly maps `status === "error"` to
`inject("error", result.info.error)` (L259–L261), producing a
`<task ... state="error"><task_error>` block in the parent (L66–L76). So the
parent is _eventually_ informed — but only at job completion. There is **no
progress, heartbeat, or stall notification**: a child that runs for 40 minutes
produces zero parent-visible signal until it finishes or is cancelled. The
prompt text actively tells the parent not to poll (L14–L19), which trades
awareness for non-interference.

**Gap:** failure is detected only by post-hoc inspection of the final message /
last tool part. If the child's loop dies in a way that leaves the job
never-completing (registry entries are process-local and non-durable —
background-job.ts L84–L88 doc comment: "process restart or owner-scope closure
loses status and interrupts live work"), the foreground parent waits
indefinitely. See §6.

## 3. Terminal states

`packages/core/src/background-job.ts` L10: `type Status = "running" | "completed" | "error" | "cancelled"`.
Mapped in task.ts: `error` → tool failure with `result.error ?? "Task failed"`
(L339), `cancelled` → `"Task cancelled"` (L340), else completed with output.
Cancellation on parent abort: `Effect.acquireUseRelease` interrupts, and the
release handler cancels the child session and job (`Effect.hasInterrupts` →
`ops.cancel` + `background.cancel`, L343–L356); the child's run effect itself
has `Effect.onInterrupt(() => ops.cancel(nextSession.id))` (L296). Interrupt of
the parent's task call also marks the part
`status: "error", error: "Cancelled"` in prompt.ts L355–L374.

## 4. Error payload diagnostic detail

Moderate. The propagated string is one of:

- provider-level: `error.data.message` or `error.name` (task.ts L215–L218);
  error classes live in `packages/opencode/src/session/message-error.ts`
  (`ProviderAuthError` carries `providerID` + `message`).
- tool-level: the child's last errored tool part's `state.error` string
  (task.ts L220–L223). Note it is **only the last** errored tool part
  (`findLast`) — earlier tool failures in the same child run are invisible to
  the parent summary (the child session transcript still exists on disk, and
  the `task_id` is embedded in the message so a human/model can resume via
  `task_id`, L63–L65).

Shell failures add rich context at the tool layer:
`packages/opencode/src/tool/shell.ts` attaches `<shell_metadata>` with timeout
and abort explanations plus exit code and truncation info in `metadata`
(L559–L569, L570–L580). Output is streamed into part metadata (`output` last
preview) while running (L489–L503), so partial output survives even for killed
commands.

## 5. Shell timeouts and network-command hangs

**Guarantee:** every shell command has a hard timeout, default
`flags.bashDefaultTimeoutMs ?? 2 * 60 * 1000` (shell.ts L347), overridable per
call via a positive `timeout` param (shell.ts L615–L618; validated positive).
Implementation (shell.ts L533–L556): the process exit code is raced against
parent-abort and `Effect.sleep(timeout + 100ms)`; on timeout or abort the
handle is killed with `forceKillAfter: "3 seconds"` (graceful-then-SIGKILL).
The tool then appends:
`shell tool terminated command after exceeding timeout <n> ms. If this command
is expected to take longer ... retry with a larger timeout value` (L559–L569).
The default timeout is also documented in the tool description presented to the
model (`packages/opencode/src/tool/shell/prompt.ts` L97, L148, L197).

**Gap:** `webfetch`/`websearch` tools were not audited in depth here, but the
31-line pattern above means a _single_ command cannot hang past ~2min by
default — the Pi incident failure mode (a hung `gh api` with no timeout) cannot
occur in OpenCode's shell tool for a single invocation. However, **a sequence
of slow-but-successful commands is unbounded**: the task tool has no wall-clock
budget, so a child that loops `gh api` calls at 2 minutes each can run for
hours while a foreground parent waits (or a background parent stays silent).
Also, `background.wait` without timeout (task.ts L333) means the foreground
race never times out; only user abort or process death ends it.

## 6. Cancellation propagation, retry exhaustion, partial output

**Cancellation.** Parent abort → `taskAbort` in prompt.ts L326–L334 (signal
passed into the tool ctx) → shell tool's abort race kills the child process;
for the task tool, `ctx.abort.addEventListener("abort", onAbort)` forks
`ops.cancel(nextSession.id)` (task.ts L307–L313), and interrupt finalizers
cancel both child session and background job (L343–L356). `Session.Event.Error`
is published on the parent. Cancellation is therefore propagated down (parent
→ child) reliably; there is no upward "I'm stuck, cancel me" path except model
initiative.

**Retry exhaustion (provider errors).** `packages/opencode/src/session/retry.ts`:
`RETRY_MAX_RETRIES = 5` (L31); `policy()` stops after 5 retries (L193),
respects `retry-after`/`retry-after-ms` headers (L51–L67), and writes attempt
metadata so the UI/model sees `message`/`action`/`next` (L195–L205). When the
child's loop finally exits with an unreplayable error, that becomes
`info.error` on the final message → the `Subagent failed (task_id: ...)` payload
(§2). So exhaustion surfaces with attempt metadata on the child part, and as a
one-line summary to the parent.

**Partial output.** The child session is persisted independently
(`sessions.create` with `parentID`), so its full transcript (including partial
tool outputs, which shell streams into part metadata) survives even when the
task tool reports failure. Background jobs, however, keep only `output` and
`error` strings on the job Info (background-job.ts L14–L22) and are explicitly
non-durable (L84–L88).

## 7. Guarantees vs. gaps (summary)

Guarantees at the inspected revision:

1. Foreground child failure always fails the parent's tool call with a
   diagnostic string that includes the resumable `task_id` (task.ts L214–L223).
2. Background child completion/failure is injected into the parent session as a
   synthetic message (task.ts L227–L264) — the parent is informed without
   polling.
3. Shell commands cannot hang past `timeout` (default 120s) — SIGKILL fallback
   after 3s (shell.ts L533–L556).
4. Parent abort cascades to child session cancel and process kill (task.ts
   L296, L343–L356; shell.ts L548–L551).
5. Provider retries capped at 5 with structured attempt metadata (retry.ts
   L31, L185–L205).
6. Depth-limited recursion (`subagent_depth`, default 1, task.ts L108–L116).

Gaps:

1. **No stall/heartbeat detection.** A child that is _running but stuck in a
   loop_ (or a never-completing job after process churn) yields no
   parent-visible signal; the foreground wait has no wall-clock budget and the
   background prompt forbids polling (task.ts L14–L19, L333).
2. **Only the last errored tool part** is surfaced to the parent; earlier
   failures in the same child run are summarized away (task.ts L220–L223).
3. **Non-durable background registry**: process restart loses job status;
   live work is interrupted with no recovery or parent notification from the
   _new_ process (background-job.ts L84–L88).
4. No aggregate wall-clock/token budget for a child run; only per-command
   timeouts bound progress.
5. Background mode is experimental and flag-gated; schema hid the `background`
   param when the flag was on (fixed upstream per issue #45345 / PR #45342 —
   web-sourced, not verified in this clone).

## 8. Current checkout vs. latest upstream

The clone pins `517ee736` (2026-08-28, "fix(provider): filter unreplayable
Bedrock reasoning before caching (#45769)"). Per the task constraint the clone
was not fetched/updated; a light web check of the same repo's tracker indicates
subsequent activity around the background-subagent schema (issue 45345, PR 45342) and older alternative implementations (PR 13261). Treat §5/§7 items
sourced from the web as unverified against a specific upstream revision; the
source line numbers above are exact for `517ee736`.

## 9. Ideas applicable to Pi (no implementation)

Mapping the Pi incident (research child ran sequential `gh api` searches, no
per-command timeout; batch ran ~43min; coordinator unaware) onto these
findings:

1. **Per-command timeout default** — OpenCode's 120s default + SIGKILL
   fallback (shell.ts L347, L533–L556) would have converted the hang into a
   visible, retryable tool error within ~2 minutes. This is the single highest
   leverage fix for the incident class.
2. **Child wall-clock budget / heartbeat** — neither mode in OpenCode has this
   and it is exactly the gap that allowed 43 minutes of silence. A max-runtime
   budget on delegated children, or periodic parent-visible heartbeat events
   (with last tool + elapsed time), would close it.
3. **Failure injection into the parent** — OpenCode's pattern of a synthetic
   `<task state="error">` message containing `task_id` + error text (task.ts
   L227–L264) matches the stated principle "automatically inform parent of
   child failure and explain how it happened"; the `task_id` enables resume
   rather than blind re-run.
4. **Surface all errored tool parts, not just the last** — a small improvement
   over OpenCode's `findLast` summary (task.ts L220–L223) when reporting child
   failure evidence.
5. **Cancellation must be cascade, not advisory** — parent abort should
   deterministically kill child processes (OpenCode's acquireUseRelease +
   onInterrupt pattern, task.ts L296, L343–L356).
6. **Never leave a wait unbounded** — even foreground waits should race a
   (large) timeout so the coordinator can report a stalled child instead of
   blocking indefinitely (BackgroundJob's `WaitInput.timeout` exists but task
   tool doesn't use it — background-job.ts L296–L298).
