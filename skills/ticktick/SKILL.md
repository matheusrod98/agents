---
name: ticktick
description: Use when listing, creating, completing, moving, or commenting on TickTick tasks, or managing TickTick projects and tags — any time the user's to-dos or tasks come up. Drives ticktick-cli with --json.
---

# TickTick CLI

`ticktick-cli` (`@ticktick/ticktick-cli`). Auth is the CLI's own store
(`ticktick-cli auth login` / `auth token`); check with
`ticktick-cli auth status`. Node ≥ 24 is required (this machine ships it).

Mutating and listing commands take `--json`. Task IDs are scoped to a
project: most mutations need both `<projectId>` and `<taskId>`.

## Flow

1. Projects: `ticktick-cli project list --json`. A project's tasks and
   columns: `ticktick-cli project data <projectId> --json`.
2. Find: `ticktick-cli task search --json "keywords"` or
   `ticktick-cli task filter --json --projects <ids> --status 0`
   (`0` open, `2` completed). Narrow with `--tag`, `--priority` (`0,1,3,5`),
   `--due-from` / `--due-to`.
3. Mutate:
   - `ticktick-cli task create --json --title "Buy milk" --project <id> --due-date <iso>`
   - `ticktick-cli task update --json <taskId> --project <id> --priority 5`
   - `ticktick-cli task complete <projectId> <taskId>`
   - `ticktick-cli task move --json --from <id> --to <id> --task <taskId>`
   - `ticktick-cli task delete <projectId> <taskId>` (confirm the ID pair
     first; never batch-delete from a guessed list)
4. Same shape elsewhere: `ticktick-cli task comment list|add|delete`,
   `ticktick-cli tag list|create`, `ticktick-cli project create|update|delete`.

Dates are `yyyy-MM-ddTHH:mm:ssZ`. Priority is `0` none, `1` low, `3` medium,
`5` high — not 1–4.

## Gotchas

- There is no `today` / `inbox` subcommand: list projects, then `project data`
  or `task filter` / `search`.
- Batch means one call per item.
- `ticktick` on PATH is the desktop app, not this CLI.
