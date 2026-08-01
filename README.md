# Agents

Personal configuration for coding agents.

## Prerequisites

- Pi
- GNU Make
- This repository cloned to `~/Projects/agents` (the path used by the Makefile)

## Setup

```sh
git clone <repository-url> ~/Projects/agents
cd ~/Projects/agents
make
```

The default target installs both the Pi configuration and the MCP registry using symlinks, so subsequent repository changes take effect without reinstalling.

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
