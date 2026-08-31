---
name: todoist
description: Use when listing, creating, completing, rescheduling, or commenting on Todoist tasks, or managing Todoist projects, labels, and filters — any time the user's to-dos or tasks come up. Drives the official td CLI with JSON output.
---

# Todoist CLI

`td` is the official Todoist CLI (`@doist/todoist-cli`). Auth comes from the
machine's token file, passed per command:

```sh
TODOIST_API_TOKEN="$(cat "$TODOIST_API_TOKEN_FILE")" td today --json
```

Export it once per shell session to avoid repeating it. Node ≥ 24 is required
(this machine ships it).

## Flow

1. Views: `td today --json` · `td inbox --json` · `td upcoming --json`.
2. Find: `td task list --project "Work" --ids-only` or with a filter:
   `td task list --filter "overdue" --json`. `--ids-only` prints bare IDs on
   stdout (pagination goes to stderr) — ideal to feed a loop.
3. Mutate, expecting JSON out:
   - `td task add "Buy milk" --due tomorrow --json`
   - `td task update <id> --priority 2 --json`
   - `td task reschedule <id> --json`
   - `td task complete <id>` / `td task uncomplete <id>`
   - `td task move <id> --project "Work"`
   - `td task delete <id> --yes` (destructive: always `--yes`-aware, never
     batch-delete without confirming the ID list first)
4. Everything else follows the same shape: `td project …` (incl. `health`,
   `progress`), `td comment add id:<TASKID> "note"`, `td label`, `td filter`,
   `td section`, `td reminder`, `td activity`, `td completed`.

## Output discipline

| flag         | effect                             |
| ------------ | ---------------------------------- |
| `--json`     | full JSON result                   |
| `--ndjson`   | newline-delimited JSON, pipe-safe  |
| `--ids-only` | bare IDs on stdout                 |
| `--quiet`    | single bare id                     |
| `--dry-run`  | preview a mutation                 |
| `--yes`      | required on destructive operations |

## Gotchas

- Batch means one call per item; there is no array-accepting add command.
- A persistent credential store exists
  (`td auth token "$TOKEN" --credential-store=plaintext`) but the `*_FILE`
  env pattern is this setup's source of truth — keep the token out of disk
  config.
