# Observed subagent orchestration problems (implement-spec run)

Evidence log for residual-problem inventory. Not implementation scope.
Facts vs hypotheses labeled. Timeout-recovery work does **not** expand to
cover these.

Companion:
[child-command-timeout-recovery-residual-problems.md](child-command-timeout-recovery-residual-problems.md).

## Incident A — T1 implementer stalled with no files, then abort

**Observed facts**

- Session:
  `/home/matheus/.pi/agent/sessions/--home-matheus-.agents.feat-child-timeout-t1--/2026-09-08T07-49-58-651Z_01a07ffe-c6fb-7741-bf60-2e2949b5674a.jsonl`
- Child id: `01a07ffe-c6fb-7741-bf60-2e2949b5674a` (T1 timeout wrapper),
  model `xai/grok-4.6:medium`
- Worktree `feat/child-timeout-t1` remained at baseline `192bca2` with no
  `timeout.ts` / tests written
- Session grew to ~79 message entries / ~269KB then ~312KB; last recorded
  assistant turns were `stopReason: toolUse` batches (read/grep/ls/find/bash)
- Coordinator `interrupt` produced activity `interrupted`
- Settled response text: `OpenAI Responses stream ended before a terminal
response event` plus `I have the seam: a timeout module... tests go in
next.`
- No feature files existed after interrupt

**Hypotheses (not established)**

- Provider stream died mid-tool-batch rather than a hung bash command
- Child was blocked on a tool so it could not consume the later coordinator
  constraint message until interrupt
- Exploration sprawl delayed writing; not proven as the stall cause

**Why timeout-recovery does not solve this**

- Spec bounds **child bash** only, not model/provider streams, tool batches
  of read/grep, or implementer-progress heartbeats
- Interrupt was coordinator-directed, not an automatic command timeout
- Partial “I have the seam” text is not a timeout incident and had no code
  artifacts

**Impact:** child can consume a long turn and produce nothing without a
timeout incident. **Scope:** out of spec.

## Incident B — Replacement required; same worktree reused

**Observed facts**

- Replacement spawned `01a08004-62bc-7741-bf60-2e309014d172` in the same
  worktree after interrupt
- First T1 produced zero commits

**Hypotheses**

- Replacement will complete T1; unknown at log time (later confirmed in G)

**Why timeout-recovery does not solve this**

- No automatic replacement spawn (explicitly out of scope)
- Parent-directed recovery is the intended loop; this run used interrupt +
  new child

**Impact:** coordinator must notice stall and spawn again. **Scope:** out of
spec.

## Incident C — Coordinator idle vs parent polling / delivery

**Observed facts**

- Implement-spec skill says do not poll children; results arrive via settled
  responses
- Parent/user asked whether the feature was usable while T1 was still
  exploring
- Root/coordinator status reports were issued after settled T1-start, not
  after T1 completion
- `deliver`/`steer` used for child questions and settled reports; busy-parent
  queue exists in runtime.ts already

**Hypotheses**

- User-visible “is it done?” friction is a UX/orchestration gap, not a bash
  hang

**Why timeout-recovery does not solve this**

- Spec notifies on **bash command timeout**, not on implementer lack of file
  writes or model-only turns
- No overall child wall-clock budget (out of scope)

**Impact:** humans see “in flight” with no progress signal. **Scope:** UX.

## Incident D — Draft PR / push later forbidden

**Observed facts**

- Draft PR https://github.com/matheusrod98/agents/pull/1 created; `pi-only`
  and feature branch pushed before user forbade further pushes
- Later instruction: no further push; original tree not merged until
  inventory + root integration agent

**Why timeout-recovery does not solve this**

- Unrelated to command timeouts

**Impact:** remote PR is stale relative to later local commits. **Scope:**
process. Integration left the remote draft PR untouched and did not push.

## Incident E — Dirty overlapping untracked paths block naive merge

**Observed facts (audit + integration)**

- Original untracked extension nine files byte-identical to feature baseline
  `192bca2`
- Original untracked spec differs (draft vs 300s authorized)
- git refuses overwrite of untracked overlapping paths
- Integration backed those files up to
  `/tmp/pi-only-pre-merge-backup-20260908`, removed the overlapping untracked
  copies, then fast-forwarded `pi-only` to `feccbf6`
- Feature timeout sources (`timeout.ts`, tests, `timeout-notify.ts`,
  post-timeout `runtime.ts` / `package.json`) were not in the original
  untracked tree
- Original `docs/research/*` was untracked and not on the feature branch;
  it was kept

**Why timeout-recovery does not solve this**

- Worktree/git integration, not runtime supervision

**Impact:** naive merge would fail or clobber. After integration this is
historical. **Scope:** VCS.

## Incident F — Steering while child is in a tool batch

**Observed facts**

- Replacement T1 `01a08004-62bc-7741-bf60-2e309014d172` last assistant
  stopReason was `toolUse` (read/ls) while still exploring despite a
  write-first brief
- Coordinator queued a steer: “Stop exploring. Write timeout.ts…”
- Runtime `deliver` uses `sendCustomMessage(..., { triggerTurn, deliverAs:
"steer" })`; queued until the child can accept input
- Spec/motivating incident: a blocked command may prevent the child from
  receiving guidance

**Hypotheses**

- Steer will apply only after the current read/ls batch finishes; if a later
  tool hangs, the steer sits unread (same class as the original 43-min
  incident, but here the batch is reads not bash)

**Why timeout-recovery does not solve this**

- Bounds child **bash** only, not read/grep/find or model tool-batch duration
- Queued parent messages are not interrupts

**Impact:** recovery text is not a kill. **Scope:** out of spec.

## Incident G — T1 completed only after interrupt + replacement

**Observed facts**

- Replacement session `01a08004-62bc-7741-bf60-2e309014d172` settled idle
  with commit `f1ccc3467ab3a2d648e3440b51f0288629a46260`
- Implementer reported 17 tests pass, 0 fail
- First T1 `01a07ffe-…` never produced files

**Hypotheses**

- Write-first brief + steer after reads reduced exploration; not proven

**Why timeout-recovery does not solve this**

- Recovery was parent interrupt + new spawn, which the spec leaves to the
  parent and does not automate

**Impact:** stalled children need a parent. **Scope:** out of spec.

## Incident H — T1 tests pass but node:test waited ~305s on open handles

**Observed facts**

- Independent verifier `01a0800f-7467-…` (`xai/grok-4.6:low`): 17 passed, 0
  failed
- Reporter `duration_ms` ~305s attributed to leftover hung inner promise in
  the unconfirmed-timeout test case
- Wrapper still times out at deadline+confirmation; classified as hygiene
  not policy fail

**Hypotheses**

- wrapChildBashOperations does not abort/abandon inner.exec on unconfirmed
  bound, so the test process stays alive until inner sleep finishes

**Update after low diagnosis (01a08015-1b41)**

- Classification **(b) production leak**, not fixture hygiene and not a 300s
  hung child
- Isolated omitted-default test: body ~1ms, `duration_ms` ≈ 305126 = 300s +
  5s confirmation
- Cause: `clock.sleep(timeoutMs+confirmationMs)` never aborted when
  `innerDone` wins `Promise.race`; `realClock.sleep` leaves `setTimeout`
- Medium fix landed as `8f560b0` on `feat/child-timeout-t1-timer-leak`
  (in spec: bounded cancellation / no leaked wait)

**Impact:** without the timer-leak fix, the suite looks hung after green
tests. **Scope:** solved in feature history; listed because it was observed
during this run.

## Incident I — `make doctor` fail on feature worktree (`missing td`)

**Observed facts**

- Full-suite verifier on `fae2ea4` (`01a0802b-d180-…`): `pnpm test` 25/25 in
  2.687s; `make doctor` **1 failure: missing td**
- Feature/isolation baseline is committed `pi-only` (`c122b71`) plus timeout
  work; it still had the old doctor CLI contract
- Original dirty tree (uncommitted at audit time) replaces Todoist with
  TickTick in skills + `scripts/doctor.sh`. That tree was **not** used for
  feature `make doctor`

**Hypotheses**

- None needed for classification: this is baseline/isolation contract drift,
  not a timeout-recovery defect and not proof the machine lacks TickTick

**Do not**

- Install `td`
- Revert TickTick migration
- Call this a machine defect

**Validation distinction**

- Feature-worktree `make doctor` failure = old Todoist/`td` contract on
  isolated baseline
- Post-integration validation on original tree must use updated TickTick
  doctor contract after merge

**Impact:** false “machine unhealthy” reading. **Scope:** isolation.

## Incident J — Integration of overlapping untracked tree (2026-09-08)

**Observed facts**

- Authorized integration agent on `/home/matheus/.agents.pi-only`
- Overlap removed only after external backup
  `/tmp/pi-only-pre-merge-backup-20260908`
- Fast-forward merge to `feccbf67339795d2ff1f7dbeb3a3604379091ae5`
- User dirty groups committed separately afterward; no secrets staged;
  `node_modules/` and `.scratch/` not committed
- No push; draft PR not touched
- Helper-test / `make` results for the integrated tree belong in the
  integration report, not in this incident as assumed pass/fail

**Hypotheses**

- None required for classification

**Why timeout-recovery does not solve this**

- Same as E: git checkout vs untracked files

**Impact:** integration required a dedicated pass; naive `wt merge` onto
default `main` would have been the wrong target. **Scope:** VCS / process.
