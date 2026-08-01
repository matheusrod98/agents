PI := $(HOME)/.pi/agent
AGENTS := $(HOME)/.agents
XDG_CONFIG_HOME ?= $(HOME)/.config
MCP_CONFIG := $(XDG_CONFIG_HOME)/mcp/mcp.json

.PHONY: all pi mcp

all: pi mcp

pi: pi\:settings pi\:extensions pi\:prompts pi\:themes

pi\:settings:
	mkdir -p "$(PI)"
	ln -sfn "$(AGENTS)/.pi/agent/settings.json" "$(PI)/settings.json"

pi\:extensions:
	mkdir -p "$(PI)"
	ln -sfn "$(AGENTS)/.pi/agent/extensions" "$(PI)/extensions"

pi\:prompts:
	mkdir -p "$(PI)"
	ln -sfn "$(AGENTS)/.pi/agent/prompts" "$(PI)/prompts"

pi\:themes:
	mkdir -p "$(PI)"
	ln -sfn "$(AGENTS)/.pi/agent/themes" "$(PI)/themes"

# Skills live in $(AGENTS)/skills, which pi discovers natively from
# ~/.agents/skills (a global skill location). No symlink is required.
pi\:skills:
	@echo "Skills are discovered natively by pi from $(AGENTS)/skills; nothing to link."

pi\:web-search:
	mkdir -p "$(PI)"
	ln -sfn "$(AGENTS)/.pi/web-search.json" "$(PI)/web-search.json"

mcp:
	mkdir -p "$(dir $(MCP_CONFIG))"
	ln -sfn "$(AGENTS)/.mcp.json" "$(MCP_CONFIG)"
