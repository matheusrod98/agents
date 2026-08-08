---
name: rd-evidence-audit
description: Audits a Jira board's weekly-sprint R&D evidence tracker, finds gaps (missing evidence, wrong status, weeks with no task at all), and backfills them with evidence grounded in real GitHub PR diffs — never guessed from a title. Use when the user wants to fill or backfill Jira R&D evidence, audit their weekly sprint tracker for gaps, or sync evidence onto one or more teammates' boards.
---

Run this as an **audit**: a systematic pass that finds every gap, grounds every claim in real evidence, and gets sign-off before anything is written. Nothing here is specific to one person or one board — the conventions below (sprint field, evidence template, transition ids) are this team's current facts, confirmed at the start of every run, not assumed to hold forever.

## Steps

### 1. Establish the board's conventions
Don't assume the sprint field, week-naming pattern, evidence template, or "done" transition id — confirm each from a real example before touching anything:
- Find the Sprint field on one of the requester's own tasks and read its naming pattern (e.g. "Semana N").
- Pull one of the requester's own **fully evidenced** tasks and copy its evidence field structure verbatim — field labels, order, and format. This is the template for everything you draft later.
- Fetch available transitions on one task to get the real "done" transition id — it can differ by project even on the same board.

**Done when:** you can state the sprint field, the week-naming convention, the verbatim evidence template, and the done-transition id, each pointing at a specific issue you pulled it from — not recalled from memory or a prior run.

### 2. Scope strictly to the requester
These boards are usually shared — teammates' tasks sit in the same weeks, same board, sometimes the same literal title. They are context only. Never edit, infer content from, or create evidence for anyone but the requester unless step 8 is explicitly invoked.

**Done when:** every issue key you're about to read or write has the requester as assignee, verified by querying `assignee = currentUser()` (or the requester's account id), not by eyeballing a list.

### 3. Map the full gap surface
Classify **every** week in the requester's working history into exactly one of three states — evidenced / task exists but empty / no task at all — by sprint field, not creation date (a task is often filed retroactively into the week it represents, not the week it was typed). Cross-reference "no task at all" weeks against the requester's own merged PRs in that date range, since a missing week is easy to miss if you only scan existing tickets.

**Done when:** you have a week-by-week table covering the requester's full range in scope with zero entries left unclassified.

### 4. Ground every evidence claim in a real diff
For each gap, find candidate PRs authored by the requester — verify the author field, don't trust a title match against the task name. Pull the actual diff, not just the title or the PR description; titles lie (a PR titled "refactor X to be generic" may do nothing of the sort). Delegate diff-reading to a subagent per PR or PR-cluster so the raw diffs don't fill your own context.

If a week has zero PRs from the requester, say so plainly. Don't stretch a thin, unrelated PR to cover it, and don't reach for a teammate's PR without a separate, explicit decision from the requester.

**Done when:** every drafted evidence text names the specific PR(s) it's grounded in, and you can point to diff content — not the title — that justifies each field of the template.

### 5. Draft, then stop for sign-off
Assemble the complete plan — every task to edit, retitle, or create, each with its full evidence text — and present it before writing anything. This is a hard gate: no Jira write happens before the requester approves the specific plan shown, not a general earlier "sounds good."

**Done when:** the requester has responded with clear approval to the plan you just presented.

### 6. Write, then verify — don't trust the write response
Edits, status transitions, and creates are three different calls with different quirks (e.g. a sprint field commonly takes a plain id on create but reads back as an object array on fetch — check both shapes before assuming a create failed the same way an edit would). A successful API response doesn't guarantee the value stuck. After writing, re-fetch each changed issue and confirm sprint, status, evidence text, and any linked epic/parent independently.

**Done when:** every planned change has been re-read from the API and matches the plan, field by field.

### 7. Check time allocation against the real calendar
Before calling it done, total each touched week's time allocation and compare it to that week's actual working days. Pull the Brazilian national holiday calendar from ANBIMA — `https://www.anbima.com.br/feriados/fer_nacionais/2026.asp` (swap the year in the URL for the year in scope) — and check every touched week against it explicitly; don't default to a full week. A week you "fixed" to the standard allocation earlier in a run may have been correct all along because of a holiday you didn't know about yet; re-check previously-touched weeks too, not just new ones.

**Done when:** every touched week's allocation equals standard days minus any holiday in that week, with the holiday calendar checked explicitly for each one — not assumed.

### 8. Team-sync (only if explicitly requested)
Only when the requester explicitly asks to mirror their evidence onto one or more teammates' boards — never infer this from a shared board or similar task names. See [TEAM-SYNC.md](TEAM-SYNC.md) before touching anyone else's tasks.

## Evidence template

Confirmed per-run in step 1 — the shape below is what this team currently uses; treat it as a starting point, not a hardcoded truth:

1. **Biblioteca** — library/package touched
2. **Teoria/Conceito** — the technical concept, grounded in the diff
3. **Ferramenta/Linguagem usada** — tools/language
4. **Valores numéricos** — any concrete numbers (counts, thresholds, metrics), or `-`
5. **Link da evidência** — the PR (or diagram/doc) link(s)
6. **Explicação de evidência anexada** — what the linked evidence actually shows
7. **Dificuldade técnica/desafio** — the real technical difficulty, drawn from the diff (e.g. a race condition fixed, an edge case handled) — not a generic restatement of the feature

## Failure modes observed

- **Trusting a title over a diff.** A task titled "refactor to be brand-agnostic" was actually Mastercard-specific hardening — the diffs said the opposite of the title. Always read the diff.
- **Assuming a flat week allocation.** Fixing "inconsistent" time values to a standard number without checking the holiday calendar first overwrote already-correct, holiday-adjusted values. Check the calendar before "fixing" anything that looks inconsistent.
- **Different API shapes for the same field.** A sprint or similar field can accept one shape on create and return another on read — verify both instead of assuming edit and create behave alike.
- **Treating a transient tool block as a real denial.** A single blocked write is often a local classifier hiccup — retry it once before reporting it as a blocker.
- **Scope creep onto a teammate's board.** A shared board makes it easy to "helpfully" fill a teammate's gap too. Don't — that's step 8, and only on explicit request.
- **Forgetting to re-derive the holiday-calendar URL's year.** The ANBIMA link is year-specific; a run scoped to a different year needs the matching year swapped into the URL, not last year's page reused.
