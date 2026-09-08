# Pi-process subagents: initial design research

> Historical research, not the implementation contract. Superseded by
> [the approved local spec](../../.scratch/recursive-subagents/spec.md).
> The approved implementation uses recursive, non-blocking SDK descendants,
> explicit work-extension selection (web research included), one passive Herdr
> tree, and a single `ask_parent` escalation. Interactive child terminals,
> takeover rules, recursion bans, and custom reboot recovery below were rejected.

The following notes preserve the original research and earlier proposals.

## Agreed constraint

Every child is a separate, normal interactive Pi instance in Herdr. The user can enter its pane and interact directly.

## Primary-source comparison

- **Claude Code:** subagents isolate task context and return results; experimental agent teams additionally support independent sessions and direct teammate interaction. Teams are the closer UX comparison, but shared task lists and peer messaging need not be copied. Engine source was not available; findings rely on official documentation. Sources: https://code.claude.com/docs/en/sub-agents and https://code.claude.com/docs/en/agent-teams
- **Codex:** child agent threads expose lifecycle operations and inspectable sessions. Useful distinctions include interrupt versus shutdown, stable identity, bounded concurrency, and context isolation. Source has multiple implementations; do not conflate product documentation with every feature on main. Sources: https://developers.openai.com/codex/subagents and https://github.com/openai/codex/blob/12fe9f822c0b02a9a257e0a248b17f1a3ad7b941/codex-rs/core/src/agent/control.rs
- **OpenCode:** child sessions have parent relationships and reusable session handles. Task-result envelopes and child navigation are useful simple primitives. Cancellation issues illustrate why handles must survive errors and interruption. Sources: https://opencode.ai/docs/agents/ and https://github.com/anomalyco/opencode/blob/dev/packages/opencode/src/tool/task.ts and https://github.com/anomalyco/opencode/issues/13910

These are documentation/source observations, not hands-on validation of the three products. Version-specific features may change.

## Proposed indispensable contracts (design inference)

1. Stable child/session identity assigned before execution; retain it on failure and cancellation. Pane identity is only a locator.
2. Explicit task brief and context policy; fresh context is a candidate default. Child logs stay out of parent context unless requested.
3. Reliable structured result delivery to the correct parent session; include child and assignment identifiers, outcome, summary, and transcript reference. Persist before notification and deduplicate delivery.
4. Separate runtime state from task outcome: idle or settled is not proof of task success.
5. Visible working/needs-input/stopped/failed states, with direct navigation to the child.
6. Interrupt current work without destroying conversation history. User cancellation must not be silently undone by parent follow-ups.
7. User interaction takes precedence; distinguish direct user messages from parent instructions. Notify the parent when the task is redirected or taken over.
8. Explicit capability configuration; do not claim tool allowlists or separate processes provide OS sandboxing. Agent messages cannot grant human approval.
9. Concurrency limit and a write-conflict policy, including the parent. Start with one writer per shared checkout; parallel writers require isolation or a deliberately agreed alternative.
10. Defined parent reload/exit behavior. Preserve session references and pending results; reconnect to surviving children or report disconnection honestly.

## Suggested small first version (not approved)

- One parent, several children; no recursive delegation.
- Background launch with automatic completion delivery.
- Start, list/inspect, send, interrupt, and open-child operations; exact tool grouping undecided.
- Herdr owns terminal topology and focus. Extension owns assignments, relationships, delivery, and lifecycle bookkeeping. Pi owns conversation and execution.
- No workflow DSL, scheduler, shared team task board, peer messaging, automatic merges, or compatibility layer for all pi-subagents features.

## Local integration evidence

Installed Pi 0.84.4 `docs/rpc.md` documents prompt, steer, abort, persistent sessions, and `agent_settled`. RPC is headless and cannot simply be treated as an interactive TUI connection. Interactive control therefore needs a separately validated extension bridge.

`pi/agent/extensions/herdr-agent-state.ts` reports Pi session references and working/blocked/idle states to Herdr, gated on `ctx.mode === "tui"`. Its settled handler also checks `ctx.isIdle()`. The file is Herdr-managed and should not be modified for this project.

Researchers also discovered https://github.com/modem-dev/pi-herdr-subagents — potentially relevant prior art, not yet independently inspected in this discussion.

## Open decisions

- Does direct user intervention automatically pause parent control, or only an explicit takeover action?
- Is Herdr required for v1? Recommended for scope control, pending user agreement.
- Should children continue after parent exit? If so, how are results recovered on resume?
- Fresh task briefs only initially, or also conversation forks?
- Child extension/tool inheritance and enforcement boundary.
- Layout policy that avoids opening an unusable number of panes.

## Research artifacts

Detailed three-agent reports are saved under:

`/home/matheus/.pi/agent/sessions/--home-matheus-.agents.pi-only--/subagent-artifacts/outputs/d0e8afd6-7dd2-4692-b8e8-ca1ac7922990/`

Files: `claude-research.md`, `codex-research.md`, `opencode-research.md`.
