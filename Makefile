SHELL := /bin/sh

ROOT := $(abspath $(dir $(lastword $(MAKEFILE_LIST))))
PI_AGENT_DIR ?= $(HOME)/.pi/agent
SOURCE_AGENT_DIR := $(ROOT)/.pi/agent
RESOURCE_DIRS := extensions skills prompts themes

.PHONY: setup link unlink check

setup: link

link:
	@set -eu; \
	mkdir -p "$(PI_AGENT_DIR)"; \
	link_path() { \
		src="$$1"; \
		dst="$$2"; \
		if [ -L "$$dst" ]; then \
			current="$$(readlink -f "$$dst")"; \
			expected="$$(readlink -f "$$src")"; \
			if [ "$$current" != "$$expected" ]; then \
				echo "refusing to replace link: $$dst" >&2; \
				exit 1; \
			fi; \
			return 0; \
		fi; \
		if [ -e "$$dst" ]; then \
			if [ -d "$$dst" ] && [ -z "$$(find "$$dst" -mindepth 1 -maxdepth 1 -print -quit)" ]; then \
				rmdir "$$dst"; \
			else \
				echo "refusing to replace existing path: $$dst" >&2; \
				exit 1; \
			fi; \
		fi; \
		ln -s "$$src" "$$dst"; \
	}; \
	link_path "$(SOURCE_AGENT_DIR)/settings.json" "$(PI_AGENT_DIR)/settings.json"; \
	for resource in $(RESOURCE_DIRS); do \
		link_path "$(SOURCE_AGENT_DIR)/$$resource" "$(PI_AGENT_DIR)/$$resource"; \
	done; \
	echo "Pi resources linked from $(ROOT)"

unlink:
	@set -eu; \
	unlink_path() { \
		src="$$1"; \
		dst="$$2"; \
		if [ ! -L "$$dst" ]; then \
			return 0; \
		fi; \
		current="$$(readlink -f "$$dst")"; \
		expected="$$(readlink -f "$$src")"; \
		if [ "$$current" != "$$expected" ]; then \
			echo "refusing to remove unrelated link: $$dst" >&2; \
			exit 1; \
		fi; \
		rm "$$dst"; \
	}; \
	unlink_path "$(SOURCE_AGENT_DIR)/settings.json" "$(PI_AGENT_DIR)/settings.json"; \
	for resource in $(RESOURCE_DIRS); do \
		unlink_path "$(SOURCE_AGENT_DIR)/$$resource" "$(PI_AGENT_DIR)/$$resource"; \
	done; \
	echo "Pi resources unlinked"

check:
	@set -eu; \
	check_path() { \
		src="$$1"; \
		dst="$$2"; \
		if [ ! -L "$$dst" ] || [ "$$(readlink -f "$$dst")" != "$$(readlink -f "$$src")" ]; then \
			echo "missing or incorrect link: $$dst" >&2; \
			exit 1; \
		fi; \
	}; \
	check_path "$(SOURCE_AGENT_DIR)/settings.json" "$(PI_AGENT_DIR)/settings.json"; \
	for resource in $(RESOURCE_DIRS); do \
		check_path "$(SOURCE_AGENT_DIR)/$$resource" "$(PI_AGENT_DIR)/$$resource"; \
	done; \
	echo "Pi resource links are correct"
