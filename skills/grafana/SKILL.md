---
name: grafana
description: Query Grafana metrics, logs, dashboards, and alerts with the official gcx CLI. Use when investigating performance on grafana-dev.tupifintech.com, searching or editing dashboards, checking firing alerts, or querying Prometheus/Loki/Tempo datasources.
---

# Grafana via gcx

`gcx` is Grafana's official agent-oriented CLI. Every command reads the server
and token from the environment — prefix each invocation with:

```sh
GRAFANA_SERVER=https://grafana-dev.tupifintech.com \
GRAFANA_TOKEN="$(cat "$GRAFANA_TOKEN_FILE")" \
```

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

- Token: `$GRAFANA_TOKEN_FILE` holds a service-account token (`glsa_...`).
  No interactive login is needed; `gcx login` exists but is Cloud-oriented.
- Version gate: gcx requires Grafana >= 12 (13+ fully supported). Confirm with
  `curl -sS "$GRAFANA_SERVER/api/health"` before blaming the CLI.
- Cloud-only feature areas (SLO, IRM, synthetic monitoring, k6, Assistant) do
  not apply to this self-hosted instance.
- Features the old MCP exposed with no gcx subcommand — Grafana Incident,
  Sift, the OnCall plugin, panel PNG rendering, dashboard JSON summaries —
  are plain HTTP APIs: drive them through `gcx api` or `curl` when needed.
- `grafanactl` is deprecated upstream (archived 2026-06-01); `gcx` is its
  successor. Treat any instruction naming grafanactl as stale and use gcx.
