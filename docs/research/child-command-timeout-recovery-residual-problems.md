# Residual orchestration problems (not solved by child-command timeout recovery)

Implementation scope was **child bash timeouts + parent notify**. This list is
not extra implementation work.

Feature branch (local): `feat/child-command-timeout-recovery`.
Confirmed feature SHA: `feccbf67339795d2ff1f7dbeb3a3604379091ae5`.
Integrated into `pi-only` by fast-forward from `c122b71`. Draft PR
https://github.com/matheusrod98/agents/pull/1 was opened before a further-push
ban; **no further push**.

## What this work does solve

- Child bash omitted timeout → 300s default; explicit positive finite
  overrides; invalid rejected
- Stop the command (reuse Pi bash kill) without aborting the child session
- Timeout result to the child; independent parent notify via existing
  deliver/steer
- Confirmed vs unconfirmed cancellation; competing-execution flag
- Redaction, bounded partial output, incident id, prior attempts
- Bound sleep aborted when inner completes (no 305s leaked timer)

## Residual problems

### 1. Model/provider stream stall (not bash)

**Facts:** First T1 session
`01a07ffe-c6fb-7741-bf60-2e2949b5674a` at
`/home/matheus/.pi/agent/sessions/--home-matheus-.agents.feat-child-timeout-t1--/2026-09-08T07-49-58-651Z_01a07ffe-c6fb-7741-bf60-2e2949b5674a.jsonl`
ended after interrupt with `OpenAI Responses stream ended before a terminal
response event`. Last assistant `stopReason` was `toolUse`
(read/grep/ls/find/bash). Zero `timeout.ts` files. Worktree stayed at
`192bca2`.

**Hypothesis:** provider stream died mid-tool-batch, not a hung bash command.

**Why timeout-recovery does not solve it:** spec explicitly out-of-scope for
model-request supervision. Bash timeout does not bound read/grep batches or
SSE streams.

**Impact:** implementer can stall with no parent timeout incident.
**Scope:** outside this spec.

### 2. Queued steer unread during tool batch

**Facts:** Coordinator queued “Stop exploring…” to replacement T1
`01a08004-62bc-7741-bf60-2e309014d172` while last stopReason was `toolUse`.
Runtime deliver uses `sendCustomMessage(..., deliverAs: "steer")`. Spec
already notes a blocked command may prevent the child from receiving
guidance.

**Hypothesis:** steer applies only after the current batch; a hung non-bash
tool leaves it unread.

**Why not solved:** only bash is wrapped. Interrupt is still parent-directed
(`session.abort`), not automatic for read/grep.

**Impact:** parent recovery messages are not interrupts.
**Scope:** outside this spec.

### 3. No automatic replacement / no child wall-clock budget

**Facts:** T1 completed only after interrupt + new spawn `01a08004-…` →
commit `f1ccc34`. Spec out of scope: automatic retries/replacement, overall
child wall-clock, heartbeats.

**Impact:** a child that never runs bash can block the coordinator until a
human/parent interrupts.
**Scope:** outside this spec.

### 4. Busy-parent / idle-coordinator UX

**Facts:** User asked if the feature was usable while T1 was still exploring.
Coordinator had reported “in flight” after spawn, not after completion.

**Hypothesis:** settled-response-only coordination feels like polling from
the user’s view.

**Why not solved:** timeout notify is for bash expiry, not “no files written”
or “still researching.”

**Impact:** humans cannot tell progress from hang without inspecting
sessions.
**Scope:** UX/orchestration, not bash timeout.

### 5. Git worktree merge vs overlapping untracked files

**Facts:** original untracked recursive-subagents nine source files were
byte-identical to feature baseline `192bca2`. Spec file differed (local draft
vs authorized 300s). `git merge` refuses to overwrite untracked overlapping
paths.

**Integration (2026-09-08):** overlapping files were copied to
`/tmp/pi-only-pre-merge-backup-20260908` then removed from the `pi-only`
worktree. Fast-forward `c122b71..feccbf6` succeeded. Feature `runtime.ts` /
`package.json` / spec were taken (timeout implementation + 300s authorized
spec). Original draft spec remains only in that backup. Untracked
`docs/research/*` was not on the feature branch and was preserved.

**Why not solved:** VCS integration, not runtime. The backup is outside the
repo and is not a substitute for history.

**Impact:** naive merge to `~/.agents.pi-only` would have failed or clobbered
unique files. After this integration, the overlap is gone on `pi-only`.
**Scope:** one-time integration; not a runtime defect.

### 6. Feature-worktree `make doctor` vs TickTick contract

**Facts:** verifier on `fae2ea4`: `make doctor` failed `missing td`. Isolated
baseline was committed `pi-only` (`c122b71`) with old Todoist/`td` doctor.
Original dirty tree replaced Todoist with TickTick in skills +
`scripts/doctor.sh`.

**Not:** machine missing TickTick; not a timeout defect.

**Post-integration:** original tree `make` uses TickTick doctor, not `td`.
Do not install `td` or revert the migration.

**Impact:** feature-worktree doctor failure must not be read as
post-integration validation.
**Scope:** isolation/baseline contract drift.

### 7. Third-party tools unbounded

**Facts:** spec out of scope “Equivalent timeout guarantees for every
third-party tool.” Child still has web research and other tools without this
wrapper.

**Impact:** hung `gh` inside bash is bounded; hung extension tools are not.
**Scope:** outside this spec.

### 8. Delivery after Pi process exit

**Facts:** spec out of scope. `deliveryFailed` only works while the owning
process lives.

**Impact:** parent notify cannot survive root process death.
**Scope:** outside this spec.

### 9. Tests are helper-level, not live AgentTree+model

**Facts:** 29 tests cover wrap/notify/delivery/process kill. No live
recursive session + model redrive.

**Hypothesis:** production `tool_execution_start` vs `onIncident` ordering is
assumed from Pi 0.85.1 event order.

**Impact:** identity/notify bugs could still appear only under a real model.
Do not claim live model E2E verified when only helper tests ran.
**Scope:** test strategy, not a failed helper suite.

### 10. Unconfirmed inner work may still run

**Facts:** after unconfirmed bound, wrapper aborts inner-only controller and
reports competing execution. Does not guarantee process death. Spec requires
honest unconfirmed, not isolation of the whole descendant tree.

**Impact:** parent must not treat replacement as safe until cancellation
confirmed.
**Scope:** in spec as honest reporting, not a missed kill guarantee.

## Integration observations (2026-09-08)

**Facts**

- `git merge --ff-only feat/child-command-timeout-recovery` on
  `/home/matheus/.agents.pi-only` moved `pi-only` from `c122b71` to
  `feccbf6`.
- Overlap backup: `/tmp/pi-only-pre-merge-backup-20260908` (SHA256 manifest
  included). Nine original extension sources matched `192bca2`; spec did not.
- Ignored `node_modules/` under the extension and `.scratch/` were left in
  place; neither was committed.
- Remaining dirty/untracked user work was committed on `pi-only` after the
  fast-forward, in separate commits (gitignore, TickTick, GitLab,
  implement-spec, recursive-subagents docs/settings, model/search
  preferences, these residual docs).
- Remote draft PR was not updated. No push.
- Helper tests and `make` on the integrated tree are validation of this
  integration; they are not live-model E2E.

**Hypotheses**

- Original `node_modules/` from the pre-timeout untracked tree may be stale
  relative to the feature `package.json` test script until `pnpm install`
  is re-run in the integrated tree.

## Orchestration evidence index

See
[child-command-timeout-recovery-orchestration-incidents.md](child-command-timeout-recovery-orchestration-incidents.md)
incidents A–I plus integration incident J.
