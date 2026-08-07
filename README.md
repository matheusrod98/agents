# Agents

Personal configuration for coding agents.

## Prerequisites

- Pi
- GNU Make
- This repository cloned to `~/.agents` (the path used by the Makefile)

## Setup

```sh
git clone <repository-url> ~/.agents
cd ~/.agents
make
```

The default target installs both the Pi configuration and the MCP registry using symlinks, so subsequent repository changes take effect without reinstalling.

Skills live in `skills/`. Pi discovers them natively from `~/.agents/skills` (a global skill location); `make pi:skills` also links them into `~/.pi/agent/skills` so every Pi resource is represented in `~/.pi/agent` (redundant but harmless).

### Available targets

```sh
make             # install the MCP registry and coding agents (Codex, Claude Code, opencode)
make pi          # install settings, extensions, prompts, themes, and skills (not part of the default target)
make pi:settings # install an individual Pi resource (also: extensions, prompts, themes, skills)
make mcp         # install the shared MCP registry
make codex       # link Codex's config.toml
make claude-code # link claude-code's skills and global settings.json
make opencode    # link opencode's config, tui config, and skills
```

Pi resources are linked into `~/.pi/agent`. The MCP registry is linked to `$XDG_CONFIG_HOME/mcp/mcp.json`, or `~/.config/mcp/mcp.json` when `XDG_CONFIG_HOME` is unset. Claude Code's global `settings.json` is linked from `claude-code/settings.json` to `$CLAUDE_CONFIG_DIR/settings.json` (default `~/.claude/settings.json`); skills are linked to `$CLAUDE_CONFIG_DIR/skills`. opencode's `opencode.json` and `tui.json` are linked from `opencode/` into `$XDG_CONFIG_HOME/opencode` (default `~/.config/opencode`); skills are linked per-skill into `$XDG_CONFIG_HOME/opencode/skills`; opencode also auto-loads `~/.agents/skills` on its own. Codex's `config.toml` is linked from `codex/config.toml` to `$CODEX_HOME/config.toml` (default `~/.codex/config.toml`).

## Home Manager

Disable the old `programs.mcp` Home Manager module in `~/.dotfiles`; otherwise a later Home Manager activation will recreate and overwrite the MCP registry symlink.
