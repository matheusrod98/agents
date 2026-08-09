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

printf 'Runtime\n'
for command in \
  drawio-mcp \
  github-mcp-server \
  mcp-grafana \
  open-computer-use \
  kubernetes-mcp-server \
  playwright-mcp \
  chromium; do
  check_command "$command"
done

if test -x "${PLAYWRIGHT_MCP_EXECUTABLE_PATH:-}"; then
  ok "PLAYWRIGHT_MCP_EXECUTABLE_PATH -> $PLAYWRIGHT_MCP_EXECUTABLE_PATH"
else
  fail "PLAYWRIGHT_MCP_EXECUTABLE_PATH"
fi

printf '\nSummary: %s failure(s)\n' "$failures"
test "$failures" -eq 0
