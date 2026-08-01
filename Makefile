PI := $(HOME)/.pi/agent
AGENTS := $(HOME)/Projects/agents/.pi/agent
SKILLS := $(HOME)/Projects/agents/.agents/skills

.PHONY: pi pi\:settings pi\:extensions pi\:prompts pi\:themes pi\:skills

pi: pi\:settings pi\:extensions pi\:prompts pi\:themes pi\:skills

pi\:settings:
	mkdir -p "$(PI)"
	ln -sfn "$(AGENTS)/settings.json" "$(PI)/settings.json"

pi\:extensions:
	mkdir -p "$(PI)"
	ln -sfn "$(AGENTS)/extensions" "$(PI)/extensions"

pi\:prompts:
	mkdir -p "$(PI)"
	ln -sfn "$(AGENTS)/prompts" "$(PI)/prompts"

pi\:themes:
	mkdir -p "$(PI)"
	ln -sfn "$(AGENTS)/themes" "$(PI)/themes"

pi\:skills:
	mkdir -p "$(PI)"
	ln -sfn "$(SKILLS)" "$(PI)/skills"
