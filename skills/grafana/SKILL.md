---
name: grafana
description: Query Grafana metrics, logs, dashboards, and alerts with the official gcx CLI. Use when investigating performance on grafana-dev.tupifintech.com, searching or editing dashboards, checking firing alerts, or querying Prometheus/Loki/Tempo datasources.
---

# Grafana via gcx

`gcx` is Grafana's official agent-oriented CLI. It authenticates through a
named login context, not environment variables.

## Auth

The `grafana-dev` context is logged in once with the service-account token;
re-run this only when the token is rotated or the context is missing:

```sh
gcx login --yes grafana-dev \
  --server https://grafana-dev.tupifintech.com \
  --token "$(cat "$GRAFANA_TOKEN_FILE")"
```

Afterwards every command is plain `gcx <command> -o json`. Output flags and
commands were verified against gcx 1.1.0.

## VPN

grafana-dev.tupifintech.com resolves through Cloudflare but the origin is
only reachable over the pritunl VPN. On timeout / "server unreachable":
check `pritunl-client list` — an empty table means the tunnel is down; ask
the user to connect it. Never retry-loop against a timed-out server.

Always append `-o json` (or `-o yaml`) for machine-readable output.

## Steps

1. Query a signal. Metrics:
   `gcx metrics query 'rate(http_requests_total[5m])' --since 1h -o json`.
   Logs:
   `gcx logs query '{app="nginx"} |= "error"' --since 1h -o json`.
   Done when the returned series or lines answer the question; narrow the
   selector or `--since` before widening the query.
2. Work with dashboards. Search:
   `gcx dashboards search "node exporter" -o json`. Pull dashboard JSON to
   disk with `gcx resources pull`, edit it, apply with `gcx resources push`
   (Editor-role token required to push; querying needs Viewer only).
3. Check alerting:
   `gcx alert rules list --state firing -o json`.
4. Anything without a first-class subcommand goes through the raw passthrough,
   which speaks the full Grafana HTTP API:
   `gcx api /api/datasources -o json`. Useful endpoints: `/api/search`,
   `/api/dashboards/uid/<uid>`, `/api/ds/query`,
   `/api/datasources/proxy/<id>/...`.

## Reference

- Token: `$GRAFANA_TOKEN_FILE` holds a service-account token (`glsa_...`);
  it is consumed by `gcx login` (above), not by day-to-day commands.
- Version gate: gcx requires Grafana >= 12 (13+ fully supported). Confirm
  with `curl -sS https://grafana-dev.tupifintech.com/api/health` (VPN on)
  before blaming the CLI.
- Cloud-only feature areas (SLO, IRM, synthetic monitoring, k6, Assistant) do
  not apply to this self-hosted instance.
- Features the old MCP exposed with no gcx subcommand — Grafana Incident,
  Sift, the OnCall plugin, panel PNG rendering, dashboard JSON summaries —
  are plain HTTP APIs: drive them through `gcx api` or `curl` when needed.
- `grafanactl` is deprecated upstream (archived 2026-06-01); `gcx` is its
  successor. Treat any instruction naming grafanactl as stale and use gcx.
