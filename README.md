# Agents

Minimal personal agent configuration.

## Setup

```sh
make            # setup Pi resources and symlink the shared MCP registry
make pi         # setup all Pi resources (settings, extensions, prompts, themes, skills)
make pi:skills  # setup pi skills
make mcp        # symlink .mcp.json at $XDG_CONFIG_HOME/mcp/mcp.json
```

Disable the old `programs.mcp` Home Manager module in `~/.dotfiles`; otherwise a later Home Manager activation will recreate and overwrite the installed file.
