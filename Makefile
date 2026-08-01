PI := $(HOME)/.pi/agent
AGENTS := $(HOME)/Projects/agents/.pi/agent

.PHONY: setup setup\:pi

setup: setup\:pi

setup\:pi:
	mkdir -p "$(PI)"
	ln -sfn "$(AGENTS)/settings.json" "$(PI)/settings.json"
	ln -sfn "$(AGENTS)/extensions" "$(PI)/extensions"
	ln -sfn "$(AGENTS)/skills" "$(PI)/skills"
