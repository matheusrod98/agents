PI := $(HOME)/.pi/agent
CLAUDE_CONFIG_DIR ?= $(HOME)/.claude
CLAUDE_USER_CONFIG ?= $(HOME)/.claude.json
CODEX_HOME ?= $(HOME)/.codex
XDG_CONFIG_HOME ?= $(HOME)/.config
MCP_CONFIG := $(XDG_CONFIG_HOME)/mcp/mcp.json
OPENCODE_CONFIG_DIR?= $(XDG_CONFIG_HOME)/opencode

.PHONY: all pi mcp claude-code opencode codex doctor pre-commit\:install skills\:update skills\:install

# Catch-all so positional skill arguments passed to `make skills:install
# <skill>` are not treated as targets to build. Only fires for goals with no
# rule at all; every real target below takes precedence.
.DEFAULT:
	@:

all: doctor
	@$(MAKE) mcp pi claude-code opencode codex
	@$(MAKE) pre-commit:install

pi: pi\:settings pi\:extensions pi\:prompts pi\:themes pi\:skills

pi\:settings:
	mkdir -p "$(PI)"
	ln -sfn "$(CURDIR)/pi/agent/settings.json" "$(PI)/settings.json"

pi\:extensions:
	mkdir -p "$(PI)"
	ln -sfn "$(CURDIR)/pi/agent/extensions" "$(PI)/extensions"

pi\:prompts:
	mkdir -p "$(PI)"
	ln -sfn "$(CURDIR)/pi/agent/prompts" "$(PI)/prompts"

pi\:themes:
	mkdir -p "$(PI)"
	ln -sfn "$(CURDIR)/pi/agent/themes" "$(PI)/themes"

pi\:skills:
	mkdir -p "$(PI)"
	ln -sfn "$(CURDIR)/skills" "$(PI)/skills"

pi\:web-search:
	mkdir -p "$(PI)"
	ln -sfn "$(CURDIR)/pi/web-search.json" "$(PI)/web-search.json"

mcp:
	mkdir -p "$(dir $(MCP_CONFIG))"
	ln -sfn "$(CURDIR)/.mcp.json" "$(MCP_CONFIG)"

claude-code: claude-code\:skills claude-code\:settings claude-code\:claude-md claude-code\:mcp

claude-code\:skills:
	mkdir -p "$(CLAUDE_CONFIG_DIR)"
	ln -sfn "$(CURDIR)/skills" "$(CLAUDE_CONFIG_DIR)/skills"

claude-code\:settings:
	mkdir -p "$(CLAUDE_CONFIG_DIR)"
	ln -sfn "$(CURDIR)/claude-code/settings.json" "$(CLAUDE_CONFIG_DIR)/settings.json"

claude-code\:claude-md:
	mkdir -p "$(CLAUDE_CONFIG_DIR)"
	ln -sfn "$(CURDIR)/claude-code/CLAUDE.md" "$(CLAUDE_CONFIG_DIR)/CLAUDE.md"

# ~/.claude.json can't be symlinked like the rest of this repo — see
# scripts/claude-code-mcp-sync.sh.
claude-code\:mcp:
	@"$(CURDIR)/scripts/claude-code-mcp-sync.sh" "$(CURDIR)/.mcp.json" "$(CLAUDE_USER_CONFIG)"

opencode: opencode\:config opencode\:tui opencode\:skills

opencode\:config:
	mkdir -p "$(OPENCODE_CONFIG_DIR)"
	ln -sfn "$(CURDIR)/opencode/opencode.json" "$(OPENCODE_CONFIG_DIR)/opencode.json"

opencode\:tui:
	mkdir -p "$(OPENCODE_CONFIG_DIR)"
	ln -sfn "$(CURDIR)/opencode/tui.json" "$(OPENCODE_CONFIG_DIR)/tui.json"

opencode\:skills:
	mkdir -p "$(OPENCODE_CONFIG_DIR)/skills"
	ln -sfn $(CURDIR)/skills/* "$(OPENCODE_CONFIG_DIR)/skills/"

codex: codex\:config codex\:skills

codex\:config:
	mkdir -p "$(CODEX_HOME)"
	ln -sfn "$(CURDIR)/codex/config.toml" "$(CODEX_HOME)/config.toml"

codex\:skills:
	mkdir -p "$(CODEX_HOME)/skills"
	ln -sfn $(CURDIR)/skills/* "$(CODEX_HOME)/skills/"

doctor:
	@"$(CURDIR)/scripts/doctor.sh"

pre-commit\:install:
	@pre-commit install

skills\:update:
	@"$(CURDIR)/scripts/skills-update.sh" "$(CURDIR)"

# Install new skills from skills.sh into skills/ and record them in
# skills-lock.json. Accepts package specs and skills.sh URLs, e.g.
#   make skills:install anthropics/skills@frontend-design
#   make skills:install https://www.skills.sh/ogulcancelik/herdr/herdr
# See scripts/skills-install.sh.
skills\:install:
	@"$(CURDIR)/scripts/skills-install.sh" "$(CURDIR)" $(filter-out skills:install,$(MAKECMDGOALS))
