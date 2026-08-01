PI := $(HOME)/.pi/agent
AGENT_SKILLS := $(HOME)/Projects/agents/.agents/skills

.PHONY: all pi

all: pi

pi: pi\:settings pi\:extensions pi\:prompts pi\:themes pi\:skills

pi\:settings:
	mkdir -p "$(PI)"
	ln -sfn "$(HOME)/Projects/agents/.pi/agent/settings.json" "$(PI)/settings.json"

pi\:extensions:
	mkdir -p "$(PI)"
	ln -sfn "$(HOME)/Projects/agents/.pi/agent/extensions" "$(PI)/extensions"

pi\:prompts:
	mkdir -p "$(PI)"
	ln -sfn "$(HOME)/Projects/agents/.pi/agent/prompts" "$(PI)/prompts"

pi\:themes:
	mkdir -p "$(PI)"
	ln -sfn "$(HOME)/Projects/agents/.pi/agent/themes" "$(PI)/themes"

pi\:skills:
	mkdir -p "$(PI)"
	ln -sfn "$(AGENT_SKILLS)" "$(PI)/skills"
