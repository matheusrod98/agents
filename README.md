# Agents

Personal configuration for coding agents: Pi, Codex, Claude Code, and opencode.
Skills, per-agent settings and prompts, themes, and MCP client registrations —
git-iterated and symlinked into place by `make`.

## What's in here

- `skills/` — the skill collection, each with its own `SKILL.md`;
- `claude-code/`, `codex/`, `opencode/` — per-agent config files
- `.pi/` — Pi settings, extensions, prompts, themes, web-search
- `.mcp.json` — the shared MCP registry
- `Makefile` — the installer; everything is symlinked, nothing copied

## Setup

Prerequisites: Pi, GNU Make, and the repository cloned to `~/.agents`
(the path the Makefile expects):

```sh
git clone https://github.com/matheusrod98/agents.git ~/.agents
cd ~/.agents
make
```

The default target symlinks everything in: the MCP registry
(`~/.config/mcp/mcp.json`, or `$XDG_CONFIG_HOME/mcp/mcp.json`), the Pi
resources (`~/.pi/agent`), and the per-agent configs below. Subsequent pulls
take effect without reinstalling — links point at the repo.

### Make targets

| target | installs |
|---|---|
| `make` | everything below |
| `make mcp` | shared registry → `$XDG_CONFIG_HOME/mcp/mcp.json` |
| `make pi` | settings, extensions, prompts, themes, skills → `~/.pi/agent` |
| `make claude-code` | `settings.json`, `CLAUDE.md`, skills → `$CLAUDE_CONFIG_DIR` (default `~/.claude`) |
| `make opencode` | `opencode.json`, `tui.json`, skills → `$XDG_CONFIG_HOME/opencode` (default `~/.config/opencode`) |
| `make codex` | `config.toml`, skills → `$CODEX_HOME` (default `~/.codex`) |

Each Pi resource also installs individually — `pi:settings`, `pi:extensions`,
`pi:prompts`, `pi:themes`, `pi:skills`, `pi:web-search` — and
`codex:skills` / `claude-code:skills` / `opencode:skills` link skills into
each agent. Pi additionally discovers skills natively from `~/.agents/skills`;
the `pi:skills` link into `~/.pi/agent` is redundant but keeps every Pi
resource under one root.

