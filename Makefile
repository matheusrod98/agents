PI := $(HOME)/.pi/agent

.PHONY: all pi doctor pre-commit\:install skills\:update skills\:install

# Catch-all so positional skill arguments passed to `make skills:install
# <skill>` are not treated as targets to build. Only fires for goals with no
# rule at all; every real target below takes precedence.
.DEFAULT:
	@:

# Install first, then verify: doctor checks the deployed state, so a
# drifted machine is repaired by the same command that reports it.
all:
	@$(MAKE) pi
	@$(MAKE) pre-commit:install
	@$(MAKE) doctor

pi: pi\:settings pi\:extensions pi\:prompts pi\:themes pi\:skills pi\:web-search

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
	mkdir -p "$(HOME)/.pi"
	ln -sfn "$(CURDIR)/pi/web-search.json" "$(HOME)/.pi/web-search.json"

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
