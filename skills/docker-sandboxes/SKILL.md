---
name: docker-sandboxes
description: Run coding agents (Claude Code, Codex, OpenCode) and throwaway build/test environments inside Docker Sandboxes (`sbx`) microVMs. Load when the user wants to sandbox an agent, run builds/tests/installs without touching the host, use `sbx run`/`sbx create`/`sbx mcp`/`sbx secret`, or asks about direct vs clone mode, sandbox templates/kits, the sbx MCP gateway, or the `shell` agent.
---

# Docker Sandboxes (`sbx`)

Docker Sandboxes run AI coding agents in isolated microVM sandboxes. Each
sandbox gets its own Docker daemon, filesystem, and network — the agent can
build containers, install packages, and run services without touching the
host. The only part of the host a sandbox sees is the workspace directory you
mount into it.

Use a sandbox whenever the agent will install packages, build images, run
databases or dev servers, or execute a test suite. Keep the host clean: the
orchestrating agent (Pi) and your editor stay on the host; the "do the work"
agent runs inside the sandbox.

## The two workspace modes (pick one per task)

This is the single most important decision. It controls whether the agent
edits your real working tree or a private copy.

**Direct mode (default).** The sandbox mounts your working tree read-write.
Agent edits appear in your checkout immediately; you review them as an
ordinary `git diff` and commit from the host. You manage branches yourself.
Best for focused, single-branch, turn-by-turn collaboration.

**Clone mode (`--clone`).** `sbx` creates a separate in-sandbox clone. The
agent edits the clone; your host tree is only readable at
`/run/sandbox/source`. Fetch the agent's branch back with
`git fetch sandbox-<name>` when done. Best for parallel/throwaway tasks where
you don't want the agent touching your tree.

Rules of thumb:

- Superproject with many git submodules → **direct mode**. Clone mode copies
  remotes but submodules need re-initializing, and it's rejected from inside a
  non-main git worktree (the `.git` pointer file can't be resolved).
- Single repo, want the agent's work isolated until you fetch it → clone mode.
- Non-git directory (scratch, scripts) → direct mode only (`--clone` requires
  a git repo).
- A clone-mode sandbox can hold several branches/worktrees; instruct the agent
  to create one branch/worktree per parallel task.

## Environment standardization (three levels)

A fresh sandbox starts with just the agent image and a shell. You can leave it
that way, pre-bake an image, or layer config at runtime.

1. **Self-provision (zero setup).** The agent installs what it needs inside
   the sandbox (`apt-get`, `go install`, `npm i -g`, …). Installed packages
   persist for the sandbox's lifetime and vanish on `sbx rm`. Good enough to
   start; slow to re-do for a heavy toolchain.
2. **Template (pre-baked image).** A Dockerfile turned into a reusable image
   with tools/packages baked in. Use for heavy, stable toolchains (Go,
   Android SDK, Node). A natural home for the workspace's
   `.devcontainer/Dockerfile.local`.
3. **Kit (declarative YAML).** Applied at sandbox creation: install commands,
   files, network/credential rules, or a whole new agent definition. Use for
   per-project or per-team config (lint config, install steps, secret
   injection) layered on top of a template. Kits are experimental.

Start at level 1; promote to a template/kit only when a toolchain is re-set-up
often enough to hurt.

## Agents

Supported out of the box: `claude`, `codex`, `copilot`, `cursor`, `droid`,
`gemini`, `kiro`, `opencode`, `docker-agent`, and `shell` (an agent-less
sandbox for manual setup).

**Pi is not a supported agent.** Two ways to use Pi with sandboxes:

- **Pi on the host (recommended).** Pi drives `sbx` as an ordinary CLI —
  `sbx run codex`, `sbx create --clone`, `sbx mcp add …` — and reviews the
  results in the working tree. This keeps Pi's host-side tools (MCP via
  `~/.config/mcp/mcp.json`, subagents, skills) intact.
- **Pi inside a `shell` sandbox.** `sbx run shell` gives you a shell; install
  Pi there (`npm i -g …` or a static binary) and run it inside the microVM.
  Only do this if you specifically want Pi itself isolated; provider keys and
  Pi's host MCP surface won't be there without extra wiring.

## Herdr integration

Herdr can still track a sandboxed agent's state even though the agent runs in
a microVM. The sandbox wrapper hides the real agent process, so set
`HERDR_AGENT=<agent>` on the host-side command to tell Herdr which agent
screen manifest to apply:

```sh
HERDR_AGENT=codex sbx run codex
HERDR_AGENT=claude sbx run claude
HERDR_AGENT=opencode sbx run opencode
```

This machine's shell wraps this for you: `sbxr <agent>` sets the hint
automatically, and `sbc`/`sbcl`/`sbo` are aliases for codex/claude/opencode.
`sbxr codex --clone` → `HERDR_AGENT=codex sbx run codex --clone`.

- Scope the hint to the single command — do not export it globally.
- Set it on the host wrapper, never inside the sandbox; a value set inside
  the VM/container is invisible to Herdr.
- Herdr then classifies `idle`/`working`/`blocked` from the agent TUI that
  `sbx` relays into the pane (screen-manifest detection).
- The only thing lost is native session identity for
  `resume_agents_on_restore` — largely redundant, since the sandbox itself
  persists across `sbx stop` and `sbx run --name` re-attaches.
- Codex and Claude Code use screen-manifest state anyway, so the hint
  recovers nearly everything. OpenCode and Pi degrade from hook-based state
  to screen-manifest state.
- If Herdr can't see the foreground process group at all, start the Herdr
  server with `HERDR_PROCESS_DETECTION=child-groups`.

## Credentials

`sbx` injects credentials through a host-side proxy so the real value never
enters the sandbox. Built-in services cover `anthropic`, `openai`, `google`,
`github`, `cursor`, `groq`, `mistral`, `xai`, `openrouter`, etc.:

```sh
sbx secret set openai      # prompts, stores in the OS keychain / fallback file
sbx secret set github      # gives the sandboxed `gh` a token
sbx secret import          # sweep env vars (ANTHROPIC_API_KEY, OPENAI_API_KEY, ...)
sbx secret ls
```

Two notes specific to this setup:

- **OpenCode** models (`opencode/deepseek-*`, `opencode-go/…`) are not in the
  built-in service table. Register `OPENCODE_API_KEY` as a custom secret keyed
  to the provider's API domain, e.g.
  `sbx secret set-custom --host api.opencode.ai OPENCODE_API_KEY` (check the
  actual domain first). Claude Code can also use `/login` OAuth inside the
  sandbox — the token stays on the host.
- The host's SSH agent is forwarded into sandboxes, so agents can sign commits
  with your SSH key without the private key leaving the host.

## MCP gateway

Sandboxed agents don't read `~/.config/mcp/mcp.json`. Register servers once on
the host and expose them to sandboxes:

```sh
sbx mcp add github --command 'github-mcp-server --toolsets=default,projects'
sbx mcp add gitlab --url https://gitlab.com/api/v4/mcp
sbx mcp ls

sbx run codex --static-mcp github,gitlab   # pre-load specific servers
# or omit --static-mcp for dynamic mode (agent discovers/attaches servers)
```

Mirror this repo's shared registry (all 12 servers) with:

```sh
~/.agents/scripts/sbx-mcp-sync.sh          # dry run: print the commands
~/.agents/scripts/sbx-mcp-sync.sh --apply  # register them with sbx
```

Local stdio servers (`--command …`) run on the host, outside sandbox
isolation — same trust posture as host-side MCP today. OAuth-backed remote
servers (context7, figma, gitlab, todoist, aws) trigger a browser flow on
first `add`.

## Day-to-day

```sh
sbx login                                  # one-time Docker OAuth
sbx run codex                              # attach to agent in cwd (creates/reuses)
sbx create --name feat-x --clone codex .   # background clone-mode sandbox
sbx run --name feat-x                      # re-attach to a named sandbox
sbx ls | sbx exec | sbx stop | sbx rm      # lifecycle
sbx run shell                              # agent-less shell for manual work
sbx ports <name>                           # publish/forward a dev-server port
sbx skills preview && sbx skills import    # share host skills into sandboxes
```

Skills are shared from `~/.agents/skills` (the Codex source path) and
`~/.claude/skills` (the Claude Code path) — both symlinks to the same tree,
so `sbx skills import` copies once and warns about the duplicate.

## Safety

- Sandboxes are network-isolated; the first run prompts for a network preset
  (Balanced is a good default). Adjust with `sbx`'s network panel.
- `sbx rm` deletes everything inside the sandbox — packages, images, the
  in-sandbox clone. Host workspace files are never affected.
- Prefer `--clone` (or at least review `git diff`) before letting an agent
  write to a shared working tree.
