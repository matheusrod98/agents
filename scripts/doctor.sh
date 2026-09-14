#!/bin/sh

set -u

failures=0
repo=$(cd "$(dirname "$0")/.." && pwd)

ok() {
  printf 'ok      %s\n' "$1"
}

fail() {
  printf 'missing %s\n' "$1"
  failures=$((failures + 1))
}

check_command() {
  name=$1
  if path=$(command -v "$name" 2>/dev/null); then
    ok "$name -> $path"
  else
    fail "$name"
  fi
}

printf 'Pi\n'
check_command pi
if test "${HERDR_ENV:-}" = 1; then
  check_command herdr
fi

printf '\nAgent CLIs\n'
for command in \
  aws \
  gh \
  glab \
  gcx \
  kubectl \
  drawio \
  ctx7 \
  playwright-cli \
  ticktick-cli \
  open-computer-use \
  chromium; do
  check_command "$command"
done

printf '\nTooling (pre-commit hooks, doctor)\n'
for command in \
  node \
  git \
  pre-commit \
  markdownlint-cli2 \
  prettier \
  shellcheck \
  shfmt; do
  check_command "$command"
done

printf '\nSandboxes\n'
check_command sbx

printf '\nDeployment links\n'
check_repo_link() {
  link=$1
  if test -L "$link"; then
    target=$(readlink -f -- "$link")
    case $target in
    "$repo"/*) ok "$link" ;;
    *) fail "$link (points outside repo: $target)" ;;
    esac
  else
    fail "$link (not a repo symlink; run make)"
  fi
}

for link in \
  "$HOME/.pi/agent/settings.json" \
  "$HOME/.pi/agent/extensions" \
  "$HOME/.pi/agent/prompts" \
  "$HOME/.pi/agent/themes" \
  "$HOME/.pi/agent/skills" \
  "$HOME/.pi/web-search.json"; do
  check_repo_link "$link"
done

# Any dangling symlink under ~/.pi, whatever created it.
broken_links=$(find "$HOME/.pi" -xtype l 2>/dev/null || true)
if test -n "$broken_links"; then
  printf '%s\n' "$broken_links"
  failures=$((failures + $(printf '%s\n' "$broken_links" | wc -l)))
fi

printf '\nSummary: %s failure(s)\n' "$failures"
test "$failures" -eq 0
