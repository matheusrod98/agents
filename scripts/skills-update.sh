#!/bin/sh
# Refresh skills with entries in skills-lock.json via the skills CLI.

set -eu

repo_root="${1:?usage: skills-update.sh <repo-root>}"

tmp_parent=$(mktemp -d)
tmp="$tmp_parent/.agents"
mkdir "$tmp"
ln -s "$repo_root/skills" "$tmp/skills"
ln -s "$repo_root/skills-lock.json" "$tmp/skills-lock.json"
trap 'rm -rf "$tmp_parent"' EXIT INT TERM

(cd "$tmp" && npx --yes skills@latest update --project)
