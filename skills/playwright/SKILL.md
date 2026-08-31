---
name: playwright
description: Use when driving a real browser over bash — navigate, click, fill, screenshot, PDF, eval JS, inspect network or console, or log into a site. Automates Chromium through named playwright-cli sessions; reaches for this on any browser-automation request.
---

# Playwright CLI

Drive Chromium with `playwright-cli` (official `@playwright/cli`). Pages are
observed through **snapshot files**, not context: snapshots land in
`.playwright-cli/*.yml` — `read` the file, act on the element refs inside it.

## Session flow

1. Open: `playwright-cli open <url> --browser=chromium`. Headless by default;
   add `--headed` to watch. The CLI pulls its own Chromium on first use; if
   that browser is unavailable, launch the system Chrome with
   `google-chrome-stable --remote-debugging-port=9222` and run
   `playwright-cli attach --cdp=9222` instead of debugging the download.
2. Snapshot: `playwright-cli snapshot --filename=page.yml`, then `read` it.
   Every interactive element carries a ref (e.g. `e15`).
   `playwright-cli snapshot --json` returns a structured snapshot instead.
3. Act on refs from the latest snapshot:
   `playwright-cli click e15` · `playwright-cli fill e12 "text"` ·
   `playwright-cli type e12 "text"` (per-keystroke) ·
   `playwright-cli select e14 <value>` · `playwright-cli upload e10 file.pdf` ·
   `playwright-cli press Enter`.
4. Re-snapshot after every action; refs go stale across navigations.
5. Give concurrent sessions names: `playwright-cli -s=shop open <url>`
   (or `PLAYWRIGHT_CLI_SESSION`).

## Common tasks

- Screenshot: `playwright-cli screenshot --filename=/tmp/page.png`
- PDF: `playwright-cli pdf --filename=/tmp/page.pdf`
- JavaScript: `playwright-cli eval "document.title"`
- Network / console: `playwright-cli requests` · `playwright-cli console`
- Tab management: `playwright-cli tab-new` / `tab-select` / `tab-close`
- Cookies/storage: `playwright-cli cookie-*`, `localstorage-*`,
  `sessionstorage-*`

## Logins

Persist auth once, reuse it forever: log in interactively (or via `fill`),
then `playwright-cli state-save auth.json`; later sessions restore with
`state-load auth.json`. Long-lived profiles use `--persistent` or
`--profile=<dir>`.

## Gotchas

- Fill forms field-by-field; there is no batch fill-form command.
- Waiting: there is no wait-for command — `sleep <n>` then re-snapshot.
- Failed commands exit non-zero; check exit codes, not vibes.
- `playwright-cli show` is a human-facing dashboard; the agent works through
  the commands above only.
