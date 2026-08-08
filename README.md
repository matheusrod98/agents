# Agents

Personal configuration for coding agents: Pi, Codex, Claude Code, and opencode.
Skills, per-agent settings and prompts, themes, and MCP client registrations are
git-iterated and symlinked into place by `make`.

## What's in here

- `skills/` — the skill collection, each with its own `SKILL.md`;
- `claude-code/`, `codex/`, `opencode/` — per-agent config files
- `.pi/` — Pi settings, extensions, prompts, themes, web-search
- `.mcp.json` — the shared MCP registry
- `Makefile` — the installer entrypoint
- `doctor.sh` — runtime checks

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

Plain `make` runs `doctor.sh` after installing the links. It checks the
configured executables and the Playwright browser path. Run `make doctor`
directly when only the machine runtime has changed.

### Make targets

| target                    | action                                                                                           |
| ------------------------- | ------------------------------------------------------------------------------------------------ |
| `make`                    | install everything below, then run `doctor`                                                      |
| `make pre-commit:install` | install the repository's Git pre-commit hook                                                     |
| `make doctor`             | verify runtime executables                                                                       |
| `make mcp`                | shared registry → `$XDG_CONFIG_HOME/mcp/mcp.json`                                                |
| `make pi`                 | settings, extensions, prompts, themes, skills → `~/.pi/agent`                                    |
| `make claude-code`        | `settings.json`, `CLAUDE.md`, skills → `$CLAUDE_CONFIG_DIR` (default `~/.claude`)                |
| `make opencode`           | `opencode.json`, `tui.json`, skills → `$XDG_CONFIG_HOME/opencode` (default `~/.config/opencode`) |
| `make codex`              | `config.toml`, skills → `$CODEX_HOME` (default `~/.codex`)                                       |
| `make skills:update`      | refresh skills managed by `skills.sh`                                                            |

Each Pi resource also installs individually — `pi:settings`, `pi:extensions`,
`pi:prompts`, `pi:themes`, `pi:skills`, `pi:web-search` — and
`codex:skills` / `claude-code:skills` / `opencode:skills` link skills into
each agent. The `pi:skills` link keeps every Pi resource under one root.

`make skills:update` refreshes skills with entries in `skills-lock.json` and
prompts before removing skills deleted upstream. Local skills without an
upstream source entry remain under this repository's control.
