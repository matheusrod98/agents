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
make open-computer-use      # fetch the native binary + build the Nix runtime env
make open-computer-use:a11y  # install/start the AT-SPI accessibility bus user service
```

Pi resources are linked into `~/.pi/agent`. The MCP registry is linked to `$XDG_CONFIG_HOME/mcp/mcp.json`, or `~/.config/mcp/mcp.json` when `XDG_CONFIG_HOME` is unset. Claude Code's global `settings.json` is linked from `claude-code/settings.json` to `$CLAUDE_CONFIG_DIR/settings.json` (default `~/.claude/settings.json`); skills are linked to `$CLAUDE_CONFIG_DIR/skills`. opencode's `opencode.json` and `tui.json` are linked from `opencode/` into `$XDG_CONFIG_HOME/opencode` (default `~/.config/opencode`); skills are linked per-skill into `$XDG_CONFIG_HOME/opencode/skills`; opencode also auto-loads `~/.agents/skills` on its own. Codex's `config.toml` is linked from `codex/config.toml` to `$CODEX_HOME/config.toml` (default `~/.codex/config.toml`); skills are linked to `$CODEX_HOME/skills`.

## Open Computer Use

All four agents expose `open-computer-use` (the open-source Computer Use MCP server) through `bin/open-computer-use`, an absolute path that only needs to exist at `~/.agents/bin` (no agent restart required after `make`).

- **Binary**: `make open-computer-use` downloads the pinned npm tarball and extracts only the statically-linked Linux runtime into `bin/open-computer-use-native`. No nix-ld or shim needed.
- **Runtime env**: the Linux runtime is a Go binary that runs an embedded Python script (`runtime.py`) requiring `python3` + PyGObject (`gi`) with the Atspi namespace, plus GTK/AT-SPI typelibs. `flake.nix` builds `open-computer-use-runtime-env` (python3-with-packages + `GI_TYPELIB_PATH`), and `make` writes a `bin/open-computer-use` wrapper that sources it before exec'ing the native binary. MCP configs point at the wrapper.
- **A11y bus**: games and most non-GNOME sessions do not autostart the AT-SPI bus. `make open-computer-use:a11y` installs and starts `open-computer-use-a11y.service` (user systemd) running `at-spi-bus-launcher`; the Computer Use tools need it to enumerate and inspect apps.
- **Skill**: `skills/open-computer-use` is vendored from `iFurySt/open-codex-computer-use` and propagates to Claude Code, opencode, and Pi through the existing skills symlinks; `codex:skills` links it into Codex.

MCP entries are registered directly in the managed configs: the shared `.mcp.json` (used by Pi), `codex/config.toml`, `claude-code/settings.json`, and `opencode/opencode.json`.

## Home Manager

Disable the old `programs.mcp` Home Manager module in `~/.dotfiles`; otherwise a later Home Manager activation will recreate and overwrite the MCP registry symlink.
