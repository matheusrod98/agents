#!/bin/sh
# Mirror the shared MCP registry (~/.agents/.mcp.json) into the Docker
# Sandboxes MCP gateway so sandboxed agents get the same servers as host
# agents.
#
#   http/remote servers  -> sbx mcp add <name> --url <url>
#   stdio servers        -> sbx mcp add <name> --command '<command> [args]'
#
# Any `env` on a stdio server is folded in with an `env K=V ...` prefix,
# because the local gateway runs stdio servers on the host and `sbx mcp add`
# has no --env flag.
#
# Usage:
#   sbx-mcp-sync.sh            # print the `sbx mcp add` commands (dry run)
#   sbx-mcp-sync.sh --apply    # execute them (requires `sbx login`)
#
# Idempotent in the sense that re-running overwrites each registration with
# the same definition. OAuth-backed remote servers (context7, figma, gitlab,
# todoist, aws) open a browser flow on first registration.

set -eu

registry="${SBX_MCP_REGISTRY:-${AGENTS_DIR:-$HOME/.agents}/.mcp.json}"
apply=0
if [ "${1:-}" = "--apply" ]; then
  apply=1
fi

[ -f "$registry" ] || {
  echo "sbx-mcp-sync: $registry not found" >&2
  exit 1
}
command -v jq >/dev/null 2>&1 || {
  echo "sbx-mcp-sync: jq is required" >&2
  exit 1
}
if [ "$apply" -eq 1 ]; then
  command -v sbx >/dev/null 2>&1 || {
    echo "sbx-mcp-sync: sbx is required for --apply" >&2
    exit 1
  }
fi

run() {
  if [ "$apply" -eq 1 ]; then
    printf '+ %s\n' "$*" >&2
    "$@"
  else
    printf '%s\n' "$*"
  fi
}

jq -r '.mcpServers | to_entries[] | [.key, (.value.type // "stdio")] | @tsv' "$registry" |
  while IFS="$(printf '\t')" read -r name type; do
    case "$type" in
    http | sse | remote)
      url=$(jq -r --arg n "$name" '.mcpServers[$n].url' "$registry")
      [ -n "$url" ] || {
        echo "sbx-mcp-sync: $name: missing url" >&2
        continue
      }
      run sbx mcp add "$name" --url "$url"
      ;;
    *)
      cmd=$(jq -r --arg n "$name" '.mcpServers[$n].command // empty' "$registry")
      if [ -z "$cmd" ]; then
        echo "sbx-mcp-sync: $name: missing command" >&2
        continue
      fi
      args=$(jq -r --arg n "$name" '.mcpServers[$n].args // [] | join(" ")' "$registry")
      # Values are assumed to contain no spaces or shell metacharacters; the
      # current registry's single env (grafana's GRAFANA_URL) satisfies this.
      envs=$(jq -r --arg n "$name" '.mcpServers[$n].env // {} | to_entries | map("\(.key)=\(.value)") | join(" ")' "$registry")
      prefix=""
      [ -n "$envs" ] && prefix="env $envs "
      run sbx mcp add "$name" --command "${prefix}${cmd}${args:+ $args}"
      ;;
    esac
  done
