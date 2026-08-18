---
name: implement
description: "Implement a piece of work based on a spec or set of tickets."
disable-model-invocation: true
---

Implement the work described by the user in the spec or tickets.

## Open the watch pane first

Before you write or edit any file, open a watch pane beside you: a Herdr split
pane running `hunk diff --watch`, so the diff re-renders live as you change the
working tree. Split to the side — right for a wide pane.

```bash
test "${HERDR_ENV:-}" = 1
herdr pane split --current --direction right --cwd "$PWD" --no-focus
herdr pane run <pane-id> "hunk diff --watch"
```

Read the new pane id from `.result.pane.pane_id`. If a Hunk session for this
repo is already live (`hunk session list`), reuse it instead of splitting. If
the first check fails you are not inside Herdr — start `hunk diff --watch` in a
background terminal instead and skip the split.

As you make each change, leave one comment on its hunk stating why. The diff
already shows what, so write only the reason, one line:

```bash
hunk session comment add --repo . --file <path> (--new-line <n> | --old-line <n>) --summary "<why>"
```

Every hunk you change gets a why comment before you move on. Full command
reference: the herdr skill (panes) and the hunk-review skill (comments).

Use /tdd where possible, at pre-agreed seams.

Run typechecking regularly, single test files regularly, and the full test suite once at the end.

Once done, use /code-review to review the work.

Commit your work to the current branch.
