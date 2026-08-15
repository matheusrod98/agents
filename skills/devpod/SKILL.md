---
name: devpod
description: >-
  Use devpod, not the devcontainer CLI. Whenever you are about to run
  devcontainer-cli or the `devcontainer` binary — up, build, exec, stop,
  status — or to work on a devcontainer.json / .devcontainer dev-container
  setup (create, edit, build, run, even when the user names no tool), use
  devpod instead: it reads the same devcontainer.json and covers every
  operation.
---

# Devpod

devpod replaces the devcontainer CLI (`devcontainer-cli`, the `devcontainer` binary from the `@devcontainers/cli` npm package). It reads the same `devcontainer.json` and runs the dev container through a provider (local docker, ssh host, kubernetes), so the workflow maps one-to-one. Never invoke `devcontainer-cli` or the `devcontainer` binary — translate every operation to devpod.

## The swap

| operation | devcontainer-cli | devpod |
|---|---|---|
| create / start a workspace | `devcontainer up --workspace-folder .` | `devpod up .` |
| run a command in the container | `devcontainer exec --workspace-folder . -- <cmd>` | `devpod ssh <workspace> --command "<cmd>"` |
| open a shell in the container | `devcontainer exec --workspace-folder . bash` | `devpod ssh <workspace>` |
| build the dev container image | `devcontainer build --workspace-folder .` | `devpod build . --repository <registry>` |
| stop (pause) the workspace | `docker stop` | `devpod stop <workspace>` |
| destroy the workspace | `docker rm` | `devpod delete <workspace>` |
| list workspaces / status | `docker ps` | `devpod list` |

## Behaviour notes

- **Addressing workspaces**: devpod names a workspace after its folder. Run `devpod up .` / `devpod ssh .` from inside the project, or pass the name. `devpod up <name>` also restarts a stopped workspace — `up` is create-and-start.
- **Config changes**: after editing `devcontainer.json` or its Dockerfile, reapply with `devpod up <workspace> --recreate`. Use `--reset` for a full rebuild from scratch. Do not delete-and-recreate for config changes.
- **Provider**: a provider must exist before the first `devpod up`. Check `devpod provider list`; add `devpod provider add docker` only when none is configured.
- **IDE popup**: `devpod up` opens an IDE by default. Pass `--ide none` when the task is headless or CLI-only.
- **Lifecycle goes through devpod, not raw docker**: the workspace may be remote, and devpod owns start/stop/sync. `docker exec`/`docker ps` against a devpod workspace bypasses that and breaks on non-docker providers. Unrelated docker work is fine — only dev-container lifecycle must route through devpod.

Pure editing of a `devcontainer.json` needs no swap; the swap applies to any run, build, or lifecycle step around it.

When the work is done, the last command executed was a devpod command — no `devcontainer-cli` invocation anywhere in the session — and the requested outcome (workspace up, command run, container gone) is verified, not assumed.
