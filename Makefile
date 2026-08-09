PI := $(HOME)/.pi/agent
CLAUDE_CONFIG_DIR ?= $(HOME)/.claude
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
	ln -sfn "$(CURDIR)/.pi/agent/settings.json" "$(PI)/settings.json"

pi\:extensions:
	mkdir -p "$(PI)"
	ln -sfn "$(CURDIR)/.pi/agent/extensions" "$(PI)/extensions"

pi\:prompts:
	mkdir -p "$(PI)"
	ln -sfn "$(CURDIR)/.pi/agent/prompts" "$(PI)/prompts"

pi\:themes:
	mkdir -p "$(PI)"
	ln -sfn "$(CURDIR)/.pi/agent/themes" "$(PI)/themes"

pi\:skills:
	mkdir -p "$(PI)"
	ln -sfn "$(CURDIR)/skills" "$(PI)/skills"

pi\:web-search:
	mkdir -p "$(PI)"
	ln -sfn "$(CURDIR)/.pi/web-search.json" "$(PI)/web-search.json"

mcp:
	mkdir -p "$(dir $(MCP_CONFIG))"
	ln -sfn "$(CURDIR)/.mcp.json" "$(MCP_CONFIG)"

claude-code: claude-code\:skills claude-code\:settings claude-code\:claude-md

claude-code\:skills:
	mkdir -p "$(CLAUDE_CONFIG_DIR)"
	ln -sfn "$(CURDIR)/skills" "$(CLAUDE_CONFIG_DIR)/skills"

claude-code\:settings:
	mkdir -p "$(CLAUDE_CONFIG_DIR)"
	ln -sfn "$(CURDIR)/claude-code/settings.json" "$(CLAUDE_CONFIG_DIR)/settings.json"

claude-code\:claude-md:
	mkdir -p "$(CLAUDE_CONFIG_DIR)"
	ln -sfn "$(CURDIR)/claude-code/CLAUDE.md" "$(CLAUDE_CONFIG_DIR)/CLAUDE.md"

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
	@"$(CURDIR)/doctor.sh"

pre-commit\:install:
	@pre-commit install

skills\:update:
	@set -eu; \
	tmp_parent=$$(mktemp -d); \
	tmp="$$tmp_parent/.agents"; \
	mkdir "$$tmp"; \
	ln -s "$(CURDIR)/skills" "$$tmp/skills"; \
	ln -s "$(CURDIR)/skills-lock.json" "$$tmp/skills-lock.json"; \
	trap 'rm -rf "$$tmp_parent"' EXIT INT TERM; \
	(cd "$$tmp" && npx --yes skills@latest update --project)

# Install new skills from skills.sh into skills/ and record them in
# skills-lock.json. Accepts package specs and skills.sh URLs, e.g.
#   make skills:install anthropics/skills@frontend-design
#   make skills:install https://www.skills.sh/ogulcancelik/herdr/herdr
# The skills CLI runs inside a throwaway project directory, so it never
# touches global agent configs (~/.claude, ~/.pi/agent, per-agent symlinks,
# nested .agents dirs). Only the skill files land in skills/ and the lock
# entry is merged into skills-lock.json.
skills\:install:
	@set -eu; \
	if [ -z "$(filter-out skills:install,$(MAKECMDGOALS))" ]; then \
		echo "usage: make skills:install <owner/repo@skill | skills.sh URL>"; \
		exit 2; \
	fi ; \
	for pkg in $(filter-out skills:install,$(MAKECMDGOALS)); do \
		norm=$$(printf '%s' "$$pkg" | sed -E 's|^https?://(www\.)?skills\.sh/||; s|^([^/@]+)/([^/@]+)/([^/@]+)$$|\1/\2@\3|'); \
		if [ -z "$$norm" ]; then \
			echo "usage: make skills:install <owner/repo@skill | skills.sh URL>"; \
			exit 2; \
		fi; \
		tmp=$$(mktemp -d); \
		trap 'rm -rf "$$tmp"' EXIT INT TERM; \
		echo "skills: installing $$norm"; \
		(cd "$$tmp" && npx --yes skills@latest add "$$norm" -y --project >/dev/null); \
		for d in "$$tmp"/.agents/skills/*/; do \
			[ -d "$$d" ] || continue; \
			name=$$(basename "$$d"); \
			rm -rf "$(CURDIR)/skills/$$name"; \
			cp -R "$$d" "$(CURDIR)/skills/"; \
			echo "skills: installed $$name -> skills/$$name"; \
		done ; \
		if [ -f "$$tmp/skills-lock.json" ]; then \
			jq --slurpfile n "$$tmp/skills-lock.json" '.skills = ((.skills // {}) + ($$n[0].skills // {})) | .skills |= (to_entries | sort_by(.key) | from_entries)' "$(CURDIR)/skills-lock.json" > "$$tmp/skills-lock.merged" \
			&& mv "$$tmp/skills-lock.merged" "$(CURDIR)/skills-lock.json"; \
			echo "skills: lock updated"; \
		else \
			echo "skills: warning: no skills-lock.json produced for $$norm"; \
		fi ; \
		trap - EXIT INT TERM; rm -rf "$$tmp"; \
	done
