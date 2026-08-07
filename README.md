# Agents

Personal configuration for coding agents.

## Repo boundary: `~/.agents` vs `~/.dotfiles`

Two repos, two questions:

- **`~/.dotfiles`** answers *"what does this machine install and run?"* —
  packages, derivations, systemd services, secrets, session wiring.
  Declarative Nix, one flake lock, rebuilt to switch.
- **`~/.agents`** answers *"how do my agents behave?"* — settings, prompts,
  themes, skills, and MCP **client** registrations. Portable, git-iterated,
  symlinked in via `make`, no rebuild.

The test: **is it a thing to install, or content an agent reads?**
Binaries, packages and services live in `~/.dotfiles` (see
`modules/home/ai/`); config, prompts and skills live here. `open-computer-use`
follows this rule too: its binary, runtime env and a11y service are packaged
in `~/.dotfiles/modules/home/ai/open-computer-use.nix`; only its MCP
registration (below) and skill live here.

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

Pi resources are linked into `~/.pi/agent`. The MCP registry is linked to `$XDG_CONFIG_HOME/mcp/mcp.json`, or `~/.config/mcp/mcp.json` when `XDG_CONFIG_HOME` is unset. Claude Code's global `settings.json` is linked from `claude-code/settings.json` to `$CLAUDE_CONFIG_DIR/settings.json` (default `~/.claude/settings.json`); skills are linked to `$CLAUDE_CONFIG_DIR/skills`. opencode's `opencode.json` and `tui.json` are linked from `opencode/` into `$XDG_CONFIG_HOME/opencode` (default `~/.config/opencode`); skills are linked per-skill into `$XDG_CONFIG_HOME/opencode/skills`; opencode also auto-loads `~/.agents/skills` on its own. Codex's `config.toml` is linked from `codex/config.toml` to `$CODEX_HOME/config.toml` (default `~/.codex/config.toml`); skills are linked to `$CODEX_HOME/skills`.

## Open Computer Use

All four agents expose `open-computer-use` (the open-source Computer Use MCP
server) through the MCP registrations below.

- **Installation is declarative**: the native binary, PyGObject/AT-SPI runtime
  env, and stable launchers (`~/.local/bin/open-computer-use`, `ocu`) are
  built by `~/.dotfiles/modules/home/ai/open-computer-use.nix`; the AT-SPI
  accessibility bus runs as the home-manager user service
  `at-spi-bus-launcher.service`. No `make` target needed — install with
  `sudo nh os switch` in `~/.dotfiles`, then relaunch any app started before
  the bus (processes only register with AT-SPI at startup).
- **Registrations** (client side, this repo): the shared `.mcp.json` (used by
  Pi), `codex/config.toml`, `claude-code/settings.json`, and
  `opencode/opencode.json` all point at `/home/matheus/.local/bin/open-computer-use`.
- **Skill**: `skills/open-computer-use` is vendored from
  `iFurySt/open-codex-computer-use` and propagates to Claude Code, opencode,
  and Pi through the existing skills symlinks; `codex:skills` links it into
  Codex.

MCP entries are registered directly in the managed configs.

## Home Manager

Disable the old `programs.mcp` Home Manager module in `~/.dotfiles`; otherwise a later Home Manager activation will recreate and overwrite the MCP registry symlink.
