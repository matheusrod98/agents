#!/bin/sh

set -u

failures=0

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
  td \
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

printf '\nSummary: %s failure(s)\n' "$failures"
test "$failures" -eq 0
