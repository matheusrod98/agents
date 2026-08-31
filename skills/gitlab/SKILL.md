---
name: gitlab
description: >-
  Operate the self-hosted GitLab at gitlab.convem.me with glab. Use when
  creating, reading, or updating merge requests, issues, pipelines, releases,
  branches, or labels on GitLab, or when raw GitLab REST is needed.
---

# GitLab CLI (`glab`) at gitlab.convem.me

Every call needs the instance host and a token exported for that command.
Domain subcommands first; `glab api` is the backdoor for the rest.

## Steps

1. Preflight — the environment must resolve:
   `test -r "$GITLAB_TOKEN_FILE" && test -n "$GITLAB_HOST"`
   Done when both pass; export the per-command env from Reference below on
   every subsequent call.
2. Confirm access: `glab auth status`. Done when the hostname
   gitlab.convem.me shows as authenticated.
3. Domain flows, always with `-R group/project`:
   - Merge requests: `glab mr list -R group/project`, `glab mr view <n> -R
group/project`, `glab mr merge <n>`.
   - Issues: `glab issue list -R group/project`.
   - CI/CD: `glab ci status -R group/project`, `glab ci list` (the
     `pipeline`/`pipe` aliases are deprecated — use `ci`).
   - Job logs: `glab ci trace <job-id|job-name>`; artifacts via
     `glab ci artifact <refName> <jobName>`.
4. For anything without a first-class subcommand (work items, wikis, members,
   project settings), use the API backdoor and filter with jq:
   ```sh
   glab api "projects/group%2Fproject/merge_requests?state=opened" | jq '.[].title'
   ```
   Done when the jq filter returns exactly the records the task needs.
   URL-encode the project path (`group%2Fproject`).
5. Lists are paginated: pass `--page`/`--per-page` on subcommands, or
   `?per_page=100` on `glab api` calls.

## Reference

- Per-command environment:
  `GITLAB_HOST=https://gitlab.convem.me GITLAB_TOKEN="$(cat "$GITLAB_TOKEN_FILE")" GLAB_NO_PROMPT=true glab ...`
- `glab api` output is JSON. Output flag spelling varies across subcommands,
  so prefer `glab api` + jq whenever the shape matters.
- `GITLAB_TOKEN` overrides any stored credential. To store it once instead:
  `glab auth login --hostname gitlab.convem.me --token "$(cat "$GITLAB_TOKEN_FILE")"`.
- Semantic code search over the instance is a GitLab Duo feature with no
  glab command; clone the repo and use grep, or scope the task to files you
  can name.
