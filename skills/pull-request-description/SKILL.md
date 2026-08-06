---
name: pull-request-description
description: >
  Writes PR titles and bodies as a snapshot of the change: the why and the
  what, with no process history and no diff-speak. Use when the user asks to
  write a PR, PR title, or PR description, or invokes /pull-request-description.
---

A PR is a **snapshot**: the state of the world after merge, written for someone who was not in the room and has not read the diff. It carries the *why* (the problem the change exists to solve) and the *what* (the behavior it produces) — never the *how* (what the diff does) and never the *process* (how it came to be).

## Steps

1. **Read the change.** Diff against the base branch, commit subjects, and any linked issue. The why often lives in the issue, not the code.
2. **Name the why.** The problem that existed before: the cost it removes, the behavior it fixes, the requirement it meets.
3. **Name the what.** The behavior or capability the change produces, one level above the diff — what a user or caller can now do that they couldn't. Check: if the sentence could be written from the diff alone, climb one level up.
4. **Write the title.** The what in one breath. Imperative mood, ≤72 chars, no trailing period. Match repo convention: use a Conventional Commits prefix (`feat:`, `fix:`, `refactor:`) when the repo's PR history uses one.
5. **Write the body.** Context first — the why, with `Closes #N` — then Solution — the behavior, one level above the diff. If the repo has a PR template (`.github/PULL_REQUEST_TEMPLATE.md`), fill it — its headings are the contract, the snapshot rules set the content (our default is in `TEMPLATE.md` next to this file). Per-file table rows follow the same rule: one row per meaningful file, brief and behavior-level — "validation extracted" — not a symbol tour: "moved validate_order()". Link issues with GitHub keywords, one bullet each: `Closes #42`, `Refs #17` — the relationship is part of the snapshot, the conversation around it is not. Impact always answers the breaking-change question; every other section vanishes when it has nothing to say.
6. **Run the snapshot test** below and revise until it passes.

## Snapshot test

Every line must survive both questions:

- **"Is this still true after merge?"** — Present tense for the result: "the order list now paginates", not "this will let users…". Past tense only for the problem: "the page was unusable at 500 orders" — never for the process: "we decided…", "we tried X first", "as discussed".
- **"Would it make sense to someone who hasn't seen the diff?"** — The what is behavior, not mechanism. "Orders can be sorted by date or customer", not "added `sort_by`/`per_page` params with whitelist validation". File, function, and parameter names belong to the diff; say what they mean. This binds table rows too: `src/orders.ts` | "parameter parsing now rejects unknown sort keys" — not symbol names.

Nothing from the process of making the change: no dead ends, no alternatives considered, no agent or AI attribution. The snapshot has no history and no people.

## Examples

Diff: `GET /api/orders` gains `sort_by`, `order`, `page`, `per_page` with whitelist validation; index on `orders.created_at`; frontend table passes the params.

- ❌ `Add sorting and pagination parameters to orders endpoint`
- ❌ Body: `Added sort_by/order/page/per_page params to GET /api/orders, validated against a whitelist, added an index on orders.created_at, and updated the frontend.`
- ✅ `feat(api): add sorting and pagination to the order list`
- ✅ Body:

```
# Context

Support agents work from the order list all day. At a few hundred
orders it rendered the full table with no way to find recent orders.

Closes #128

# Solution

The order list now sorts by date or customer and paginates, so large
accounts load fast and agents can find recent orders without
scrolling. The default view is unchanged.

## Validation

Manual pass on a 1k-order account; existing suite green.

## Changes

| File | Changes |
| ---- | ------- |
| `src/orders/api.ts` | Accepts sort and page params, rejects unknown sort keys |
| `db/migrations/…` | index on order date so pagination stays fast |
| `frontend/orders-table.tsx` | renders paged, sorted data |

# Impact

- [x] No breaking change
```

Diff: one 300-line `checkout.py` split into modules; validation extracted into a `validators` package.

- ❌ `Refactor checkout.py and move validation to validators package`
- ✅ `refactor: extract checkout validation into a package`
- ✅ Body:

```
# Context

Adding a payment method meant editing one 300-line function where
validation was tangled into the flow.

# Solution

Checkout validation now lives in one package with a single entry
point, and each rule is testable in isolation. No behavior change.

## Changes

| File | Changes |
| ---- | ------- |
| `checkout.py` | delegates validation to the new package |
| `validators/` | each rule now testable on its own |

# Impact

- [x] No breaking change
```

(Validation vanished here — nothing to show. Impact kept the question.)

## Boundaries

Writes the title and body only — the text a PR needs. Does not create branches, commits, or the pull request itself.
