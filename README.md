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

Skills live in `skills/` and are discovered natively by Pi from `~/.agents/skills` (a global skill location), so no symlink is needed for them.

### Available targets

```sh
make             # install Pi resources and the MCP registry
make pi          # install settings, extensions, prompts, and themes
make pi:settings # install an individual Pi resource (also: extensions, prompts, themes)
make pi:skills   # no-op: skills are discovered natively from ~/.agents/skills
make mcp         # install the shared MCP registry
```

Pi resources are linked into `~/.pi/agent`. The MCP registry is linked to `$XDG_CONFIG_HOME/mcp/mcp.json`, or `~/.config/mcp/mcp.json` when `XDG_CONFIG_HOME` is unset.

## Home Manager

Disable the old `programs.mcp` Home Manager module in `~/.dotfiles`; otherwise a later Home Manager activation will recreate and overwrite the MCP registry symlink.
