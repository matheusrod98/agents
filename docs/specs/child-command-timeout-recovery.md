# Recoverable child-command timeouts

## Problem Statement

A recursive subagent can become blocked on a shell command indefinitely. Its parent cannot redirect it effectively without knowing which operation stalled, whether it stopped, and what progress survives.

In the motivating incident, a child continued past an HTTP 500 and subsequently blocked on a shell command containing sequential GitHub API searches. The tool batch remained unfinished for approximately 43 minutes before cancellation. The HTTP error is not an established cause of the stall.

The existing runtime already delivers settled responses, runtime failures, and extension errors to parents. The gap is bounded command execution and actionable timeout reporting before a child settles normally.

## Solution

Give child shell commands a finite timeout. On expiry, stop the command rather than immediately terminating the whole child, preserve available evidence, and automatically notify the parent. Return a timeout result to the child so it can recover.

The parent can then redirect the existing child or delegate a replacement using retained progress and a different approach. Notification alone is insufficient: a blocked command may prevent the child from receiving guidance.

## User Stories

1. As a user, I want finite child-command execution limits, so that a stalled request cannot block work indefinitely.
2. As a parent agent, I want automatic timeout notifications, so that I do not need to poll children.
3. As a parent agent, I want the affected child and task identified, so that I know which work needs attention.
4. As a parent agent, I want the blocked command and its execution context, so that I can avoid repeating the failing operation.
5. As a parent agent, I want elapsed time and the deadline, so that I understand why execution was stopped.
6. As a parent agent, I want partial output, so that I can determine how far the operation progressed.
7. As a parent agent, I want observed errors separated from inferred causes, so that my recovery instructions are evidence-based.
8. As a parent agent, I want cancellation status, so that I do not start competing work while the original operation remains active.
9. As a parent agent, I want the child's current activity reported, so that I know whether it has resumed or remains interrupted.
10. As a parent agent, I want existing findings and artifact references retained, so that a redrive does not repeat completed research.
11. As a parent agent, I want unfinished work identified when available, so that I can give focused continuation instructions.
12. As a child agent, I want a timeout result without losing my session, so that I can recover using my accumulated context.
13. As a parent agent, I want to redirect the same child, so that it can change approach without starting from scratch.
14. As a parent agent, I want enough recovery context to brief a replacement, so that an unusable child does not block completion.
15. As a parent agent, I want prior timeout attempts visible, so that I can avoid repeated identical redrives.
16. As a user, I want an explicit finite timeout override for legitimate long commands, so that useful work is not constrained to one fixed duration.
17. As a user, I want bounded and redacted diagnostics, so that notifications do not expose secrets or overwhelm agent context.
18. As a user, I want notification delivery failures surfaced, so that a child's problem cannot disappear silently.
19. As a user, I want manual interruption distinguished from timeout, so that the parent does not misdiagnose my intervention.
20. As a parent agent, I want correlated incident updates without duplicate recovery triggers, so that one timeout does not cause multiple replacement attempts.

## Implementation Decisions

- Extend the existing recursive-agent runtime, child tool provisioning, and automatic parent-reporting mechanism. Do not introduce an independent coordination system.
- Enforce a finite default timeout for child shell commands, including commands that omit a timeout. Default is 300 seconds when timeout is omitted, matching Pi's HTTP idle default and leaving headroom for tests and builds. Support explicit positive finite overrides. Reject non-positive or non-finite limits.
- Prefer the existing shell tool's timeout and cancellation capabilities. Verify their subprocess-termination behavior before relying on them. Do not assume session abort is equivalent to cancelling one tool.
- Stop the smallest affected execution unit. A command timeout is not automatically a terminal child failure.
- Deliver a timeout result to the child and independently notify its immediate parent. Parent notification must not depend on the child producing a final response.
- Preserve existing idle-parent wake-up and busy-parent queued delivery behavior. Do not introduce concurrent model turns to force redirection.
- Give each timeout incident a stable identifier associated with its child, execution attempt, and tool call. Correlate cancellation updates and prevent duplicate reporting of the same transition.
- Include task identity, redacted operation and arguments, execution context, timing, bounded partial output, observed errors, cancellation status, child activity, available artifact references, source-session reference, and relevant prior timeout attempts.
- Capture execution evidence before delivery. Do not depend on a blocked child generating a fresh progress summary. Reference existing findings and mark missing information as unavailable.
- Distinguish observed facts from inferred causes. An earlier HTTP error must not be presented as the cause of a later shell stall without evidence.
- Cancellation must itself be bounded. If termination cannot be confirmed, report that state promptly rather than claiming the command stopped or waiting indefinitely to notify.
- Reuse retained-session diagnostics and the existing delivery-failure escalation mechanism. Notification truncation must retain critical incident fields and point to retained evidence.
- Recovery is parent-directed: resume with changed guidance, delegate a replacement, or finish from partial findings. No automatic identical retry is required.
- A replacement must not be presented as safe from competing execution while the old command's termination is unconfirmed. Isolation guarantees beyond command termination are not assumed.
- Preserve distinct outcomes for manual interruption, tool timeout, ordinary tool failure, and terminal child failure.

## Testing Decisions

- Prefer one high-level behavioral seam: the recursive-agent runtime interacting with controlled child sessions and observing tool outcomes and parent messages. Use a controllable clock rather than real waits for deadline tests.
- Assert externally visible behavior, not private timer structures, implementation call order, or helper names.
- Existing session-event subscriptions, automatic parent delivery, and retained-session reporting are the integration points to exercise. No established test-suite prior art was found in the inspected extension directory.
- Cover normal completion, omitted-timeout enforcement, explicit finite overrides, invalid limits, and timeout/completion races.
- Verify that a timeout reaches the parent without polling and does not require a final child response.
- Verify bounded evidence, redaction, correct cancellation status, preservation of available progress, and explicit unknowns.
- Verify that the child can receive recovery guidance and continue through an alternative operation after a timeout.
- Verify incident deduplication, busy-parent delivery, closed-parent delivery failure, and manual interruption classification.
- Add one narrow real-process integration test for termination of a hung shell command and its subprocesses while preserving partial output. Mocked session tests cannot establish process-termination guarantees.
- Test that unconfirmed cancellation is reported within a bounded period and is never mislabeled as successful termination.
- Confirmed seams: runtime-level behavioral tests plus a real-process cancellation integration test.

## Out of Scope

- Implementing the feature as part of compiling this specification.
- Automatic root-cause diagnosis of network failures.
- Automatic retries, replacement spawning, or guaranteed task success.
- Overall child wall-clock budgets, model-request supervision, heartbeat monitoring, and soft-warning thresholds.
- Equivalent timeout guarantees for every third-party tool.
- Redesigning recursive scheduling or cancellation of entire descendant trees.
- Guaranteed delivery after the owning Pi process exits.
- Treating a settled response as proof that the requested task succeeded.

## Further Notes

The recovery loop is: command timeout, stop command, preserve evidence, notify parent, then continue with a changed approach. If cancellation is unconfirmed, notify with that limitation instead of hiding the incident.

For the motivating incident, useful recovery guidance would skip the blocked GitHub API searches, inspect local sources, and finish from already verified findings. Merely repeating the same command would not satisfy the recovery goal.

Research supporting this specification is recorded in the Codex and OpenCode child-failure-supervision reports under the repository's research documentation. Their findings are pinned to inspected local revisions, not guarantees about latest upstream behavior.

Status: implementation authorized. Default omitted-timeout is 300 seconds. Tracker issues were not published; implementation uses a local task graph. Proposed test seams: runtime-level behavioral tests with a controllable clock, plus one real-process cancellation integration test.
