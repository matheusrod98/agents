---
name: gitlab
description: >-
  Operate GitLab with glab — merge requests, issues, pipelines, releases,
  labels, or raw GitLab REST. Host and project resolve from the repo's git
  remotes, so any GitLab instance works, not only the company one.
---

# GitLab CLI (`glab`)

glab resolves the instance and project from the repo's git remotes;
credentials are stored per host by `glab auth login`. Domain subcommands
first; `glab api` is the backdoor for the rest.

## Steps

1. Resolve the target from the remote: `git remote get-url origin`. The URL
   carries both the host and the project path in one of the usual forms —
   `git@host:group/project.git`, `ssh://git@host[:port]/group/project.git`,
   `https://host/group/project.git`. Done when you can name the host and
   `group/project`. Instances that split git and API hosts (convem: remotes
   at `ssh.gitlab.convem.me`, API at `gitlab.convem.me`) are bridged by glab's
   per-host `ssh_host` config — the API host is the one to use.
2. Confirm access: `glab auth status`. Done when the target host shows as
   authenticated. A missing host needs a one-time human login:
   `glab auth login --hostname <host>` (interactive; the token lands in the
   keyring or glab config for that host only).
3. Domain flows — inside the repo glab infers host and project itself; add
   `-R group/project` and `--hostname <host>` when calling from outside the
   repo or when more than one host is authenticated:
   - Merge requests: `glab mr list`, `glab mr view <n>`, `glab mr merge <n>`.
   - Issues: `glab issue list`.
   - CI/CD: `glab ci status`, `glab ci list` (the `pipeline`/`pipe` aliases
     are deprecated — use `ci`).
   - Job logs: `glab ci trace <job-id|job-name>`; artifacts via
     `glab ci artifact <refName> <jobName>`.
4. API backdoor for anything without a first-class subcommand (work items,
   wikis, members, project settings), filtered with jq:
   ```sh
   glab api --hostname <host> "projects/group%2Fproject/merge_requests?state=opened" | jq '.[].title'
   ```
   Done when the jq filter returns exactly the records the task needs.
   URL-encode the project path (`group%2Fproject`).
5. Lists are paginated: pass `--page`/`--per-page` on subcommands, or
   `?per_page=100` on `glab api` calls.

## Reference

- convem repos live under `~/work/convem/repos/`; `glab repo clone
  convem/<project>` reuses the server's advertised SSH URL, so new remotes
  match the existing `git@ssh.gitlab.convem.me:` shape.
- Git transport is SSH and requires the VPN; the REST API over HTTPS does
  not. A push/fetch that times out means the VPN is off.
- `GITLAB_TOKEN`, `GITLAB_ACCESS_TOKEN`, or `OAUTH_TOKEN` in the environment
  override the stored credential on every host. If a known-good host
  suddenly returns 401, check for one: `env | grep -i gitlab`.
- `glab api` output is JSON with no `--jq` flag; pipe to `jq`.
  `glab api version` returns the server version; `glab version` is the
  client's.
- Semantic code search over an instance is a GitLab Duo feature with no glab
  command; clone the repo and use grep, or scope the task to files you can
  name.
