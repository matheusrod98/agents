#!/bin/sh
# Install skills from skills.sh into skills/ and record them in
# skills-lock.json. Accepts package specs and skills.sh URLs, e.g.
#   scripts/skills-install.sh <repo-root> anthropics/skills@frontend-design
#   scripts/skills-install.sh <repo-root> https://www.skills.sh/ogulcancelik/herdr/herdr
# Runs the skills CLI inside a throwaway project directory, so it never
# touches global agent configs (~/.claude, ~/.pi/agent, per-agent symlinks,
# nested .agents dirs). Only the skill files land in skills/ and the lock
# entry is merged into skills-lock.json.

set -eu

repo_root="${1:?usage: skills-install.sh <repo-root> <package|URL>...}"
shift

if [ "$#" -eq 0 ]; then
  echo "usage: make skills:install <owner/repo@skill | skills.sh URL>"
  exit 2
fi

for pkg in "$@"; do
  norm=$(printf '%s' "$pkg" | sed -E 's|^https?://(www\.)?skills\.sh/||; s|^([^/@]+)/([^/@]+)/([^/@]+)$|\1/\2@\3|')
  if [ -z "$norm" ]; then
    echo "usage: make skills:install <owner/repo@skill | skills.sh URL>"
    exit 2
  fi
  tmp=$(mktemp -d)
  trap 'rm -rf "$tmp"' EXIT INT TERM
  echo "skills: installing $norm"
  (cd "$tmp" && npx --yes skills@latest add "$norm" -y --project >/dev/null)
  for d in "$tmp"/.agents/skills/*/; do
    [ -d "$d" ] || continue
    name=$(basename "$d")
    rm -rf "$repo_root/skills/$name"
    cp -R "$d" "$repo_root/skills/"
    echo "skills: installed $name -> skills/$name"
  done
  if [ -f "$tmp/skills-lock.json" ]; then
    jq --slurpfile n "$tmp/skills-lock.json" '.skills = ((.skills // {}) + ($n[0].skills // {})) | .skills |= (to_entries | sort_by(.key) | from_entries)' "$repo_root/skills-lock.json" >"$tmp/skills-lock.merged" &&
      mv "$tmp/skills-lock.merged" "$repo_root/skills-lock.json"
    echo "skills: lock updated"
  else
    echo "skills: warning: no skills-lock.json produced for $norm"
  fi
  trap - EXIT INT TERM
  rm -rf "$tmp"
done
