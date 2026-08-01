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
make             # install Pi resources and the MCP registry
make pi          # install settings, extensions, prompts, themes, and skills
make pi:settings # install an individual Pi resource (also: extensions, prompts, themes, skills)
make mcp         # install the shared MCP registry
```

Pi resources are linked into `~/.pi/agent`. The MCP registry is linked to `$XDG_CONFIG_HOME/mcp/mcp.json`, or `~/.config/mcp/mcp.json` when `XDG_CONFIG_HOME` is unset.

## Home Manager

Disable the old `programs.mcp` Home Manager module in `~/.dotfiles`; otherwise a later Home Manager activation will recreate and overwrite the MCP registry symlink.
