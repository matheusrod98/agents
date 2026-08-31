---
name: github
description: >-
  Operate GitHub with gh. Use when creating, reading, or reviewing issues,
  pull requests, releases, Actions runs, or Projects (v2) items, or when a
  task needs GitHub REST or GraphQL beyond plain git operations.
---

# GitHub CLI (`gh`)

Domain subcommands first, `gh api` for everything else. Projects v2 ships as
the `gh project` command group; GraphQL covers its rarer corners.

## Steps

1. Pick the domain command: `gh repo`, `gh issue`, `gh pr`, `gh search`,
   `gh release`, `gh run`, `gh project`. Check subcommand flags with
   `<command> --help` before composing a call.
2. Request JSON explicitly and filter with `--jq`:
   ```sh
   GH_PAGER=cat gh issue list --repo owner/repo --state open \
     --json number,title,author,labels --jq '.[].title'
   ```
   Done when the output is the exact field set the next step needs.
3. For review flows: `gh pr view <n> --repo owner/repo --json
title,body,commits,reviews,files`, then `gh pr checks <n>` and
   `gh pr diff <n>`.
4. Projects v2 via `gh project`: `item-list`, `item-add`, `item-edit`,
   `item-archive`, `field-list` — e.g.
   `gh project item-list 1 --owner myorg --format json`.
   The token needs the `project` scope; if calls fail with a scope error, run
   `gh auth refresh -s project`.
5. Anything without a subcommand goes through the API: REST with
   `gh api <endpoint>`, GraphQL with
   `gh api graphql -f query='query { ... }'`. Projects views, status updates,
   and iteration fields live here.

## Reference

- Set `GH_PAGER=cat` so output never blocks a non-interactive run.
- `--json` takes an explicit field list; an unknown field fails the call —
  start small, then extend.
- Auth is already configured (`gh auth status` shows the active account).
  For headless one-shots or a different identity, override with
  `GH_TOKEN="$(cat "$GITHUB_TOKEN_FILE")"`; enterprise hosts additionally
  need `GH_HOST` + `GH_ENTERPRISE_TOKEN`.
- `gh api` paginates: pass `-X GET -F per_page=100` and follow the
  `Link` header, or use `--paginate` where supported.
