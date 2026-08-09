#!/bin/sh
# Merge the shared MCP registry's `mcpServers` key into Claude Code's
# user-scope config (~/.claude.json). That file also holds OAuth tokens and
# session state, so it can't be symlinked wholesale like the rest of this
# repo's config; only the mcpServers key is touched.

set -eu

registry="${1:?usage: claude-code-mcp-sync.sh <registry.json> <claude-user-config>}"
target="${2:?usage: claude-code-mcp-sync.sh <registry.json> <claude-user-config>}"

if [ ! -f "$target" ]; then
  echo "claude-code:mcp: skipping, $target not found (run claude once to create it)"
  exit 0
fi

tmp=$(mktemp)
jq --slurpfile reg "$registry" '.mcpServers = $reg[0].mcpServers' "$target" >"$tmp"
mv "$tmp" "$target"
