PI := $(HOME)/.pi/agent
CLAUDE_CONFIG_DIR ?= $(HOME)/.claude
AGENTS := $(HOME)/.agents
XDG_CONFIG_HOME ?= $(HOME)/.config
MCP_CONFIG := $(XDG_CONFIG_HOME)/mcp/mcp.json
OPCODE_CONFIG_DIR ?= $(XDG_CONFIG_HOME)/opencode

.PHONY: all pi mcp claude-code opencode

all: pi mcp claude-code opencode

pi: pi\:settings pi\:extensions pi\:prompts pi\:themes pi\:skills

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

pi\:skills:
	mkdir -p "$(PI)"
	ln -sfn "$(AGENTS)/skills" "$(PI)/skills"

pi\:web-search:
	mkdir -p "$(PI)"
	ln -sfn "$(AGENTS)/.pi/web-search.json" "$(PI)/web-search.json"

mcp:
	mkdir -p "$(dir $(MCP_CONFIG))"
	ln -sfn "$(AGENTS)/.mcp.json" "$(MCP_CONFIG)"

claude-code: claude-code\:skills

claude-code\:skills:
	mkdir -p "$(CLAUDE_CONFIG_DIR)"
	ln -sfn "$(AGENTS)/skills" "$(CLAUDE_CONFIG_DIR)/skills"

opencode: opencode\:skills

opencode\:skills:
	mkdir -p "$(OPCODE_CONFIG_DIR)/skills"
	ln -sfn $(AGENTS)/skills/* "$(OPCODE_CONFIG_DIR)/skills/"
