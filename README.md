# Agents

Personal configuration for coding agents: Pi, Codex, Claude Code, and opencode.
Skills, per-agent settings and prompts, themes, and MCP client registrations are
git-iterated and symlinked into place by `make`.

## What's in here

- `skills/` — the skill collection, each with its own `SKILL.md`;
- `claude-code/`, `codex/`, `opencode/` — per-agent config files
- `claude-code/`, `codex/`, `opencode/` — per-agent config files; each agent also carries its own git guard hook (`claude-code/git-guard.cjs`, `codex/git-guard.cjs`, `opencode/git-interceptor.ts`, ported from pi's `git-interceptor` extension)
- `pi/` — Pi settings, extensions, prompts, themes, web-search
- `.mcp.json` — the shared MCP registry
- `Makefile` — the installer entrypoint
- `scripts/` — standalone scripts invoked by `make` targets: `doctor.sh` (runtime checks), `claude-code-mcp-sync.sh` (merges the MCP registry into `~/.claude.json`), `skills-update.sh` / `skills-install.sh` (the `skills:*` targets)

## Setup

Prerequisites: GNU Make and the agent clients you want to configure. The
repository can be cloned anywhere:

```sh
git clone https://github.com/matheusrod98/agents.git ~/.agents
cd ~/.agents
make
```

The repository's pre-commit hooks use formatting and linting tools supplied by
the machine configuration. Enable them once with `pre-commit install`.

The default target symlinks everything in: the MCP registry
(`~/.config/mcp/mcp.json`, or `$XDG_CONFIG_HOME/mcp/mcp.json`), the Pi
resources (`~/.pi/agent`), and the per-agent configs below. Subsequent pulls
take effect without reinstalling — links point at the repo.

## Runtime contract

Agent configs refer to MCP servers by executable name, not by package-manager or
machine-specific paths. The environment that launches the agents must provide
those executables on `PATH`.

Playwright MCP additionally reads `PLAYWRIGHT_MCP_EXECUTABLE_PATH` to locate the
browser executable. The machine configuration provides that variable; this repo
only declares the Playwright server and its browser mode.

Plain `make` runs `scripts/doctor.sh` after installing the links. It checks the
configured executables and the Playwright browser path. Run `make doctor`
directly when only the machine runtime has changed.

### Make targets

| target                    | action                                                                                                                                                                                     |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `make`                    | run `doctor`, install everything below, then install the Git hook                                                                                                                          |
| `make pre-commit:install` | install the repository's Git pre-commit hook                                                                                                                                               |
| `make doctor`             | verify runtime executables                                                                                                                                                                 |
| `make mcp`                | shared registry → `$XDG_CONFIG_HOME/mcp/mcp.json`                                                                                                                                          |
| `make pi`                 | settings, extensions, prompts, themes, skills → `~/.pi/agent`                                                                                                                              |
| `make claude-code`        | `settings.json`, `CLAUDE.md`, skills → `$CLAUDE_CONFIG_DIR` (default `~/.claude`); merges the shared MCP registry into `~/.claude.json`                                                    |
| `make opencode`           | `opencode.json`, `tui.json`, skills → `$XDG_CONFIG_HOME/opencode` (default `~/.config/opencode`)                                                                                           |
| `make codex`              | `config.toml`, skills → `$CODEX_HOME` (default `~/.codex`)                                                                                                                                 |
| `make skills:update`      | refresh skills managed by `skills.sh`                                                                                                                                                      |
| `make skills:install`     | add a skill from `skills.sh` (accepts a package spec or URL, e.g. `make skills:install anthropics/skills@frontend-design` or `make skills:install https://www.skills.sh/owner/repo/skill`) |

Each Pi resource also installs individually — `pi:settings`, `pi:extensions`,
`pi:prompts`, `pi:themes`, `pi:skills`, `pi:web-search` — and
`codex:skills` / `claude-code:skills` / `opencode:skills` link skills into
each agent. The `pi:skills` link keeps every Pi resource under one root.

### MCP servers

`.mcp.json` is the single MCP registry. Pi reads it via the
`~/.config/mcp/mcp.json` symlink; `make claude-code:mcp` merges it into
Claude Code's user-scope config instead (see `scripts/claude-code-mcp-sync.sh`
for why it can't just be symlinked). Claude Code plugins (`enabledPlugins`)
stay hand-declared in `claude-code/settings.json` since they aren't part of
the shared registry.

This repo's own `.mcp.json` is deliberately disabled as a _project_-scoped MCP
source when working inside this repo (`.claude/settings.local.json` sets
`enableAllProjectMcpServers: false`) — those same servers are already
registered at user scope, and project scope takes precedence, so leaving it
enabled would risk shadowing the user-scope entries with duplicates.

`make skills:update` refreshes skills with entries in `skills-lock.json` and
prompts before removing skills deleted upstream. Local skills without an
upstream source entry remain under this repository's control.

`make skills:install <package|URL>` installs a new skill through the `skills`
CLI inside a throwaway project directory, so only `skills/<name>/` and the
lock entry in `skills-lock.json` are touched — never global agent configs or
per-agent symlink directories.
