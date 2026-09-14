---
name: desktop-automation
description: Drive the desktop on this Wayland (niri) machine with open-computer-use plus wtype for keyboard. Use when controlling apps, clicking, typing into windows, reading UI state, pressing keys, or when press_key/keyboard input silently does nothing.
---

# Desktop automation (niri/Wayland)

Computer use on this machine pairs `open-computer-use` (`ocu`, see its skill for tool syntax) with `wtype` for keyboard. The split is forced by the platform: OCU's input synthesis silently no-ops on Wayland, while its AT-SPI tools work.

## Core loop

1. **Read**: `ocu call list_apps`, then `ocu call get_app_state --args '{"app":"<app>"}'`. Element indexes come from this state.
2. **Act**: `click`, `type_text`, `set_value` — all element-targeted, all chained with the state read in one `--calls '[...]'` array. State dies with the process; a lone action call in a fresh process fails with "No app state is available".
3. **Keys** go through `wtype`, never OCU `press_key`: `wtype -k Return`, `wtype -M ctrl -k t -m ctrl`, `wtype 'text'`. `scroll` does not work either — scroll via element actions or ask the user.
4. **Verify by receipt** — changed file content, new window title, new text in the next `get_app_state`. `isError: false` proves delivery for none of the input tools; a receipt proves it for all.

Done means the effect is observable in the target, not that a tool returned success.

## Why the split

`press_key`, `scroll`, and pointer synthesis go through AT-SPI input injection, which on this session is accepted-but-undelivered: `isError: false` while zero events land. `wtype` injects through the compositor's virtual keyboard and delivers for real. `type_text`, `set_value`, and element `click` bypass injection entirely (direct AT-SPI calls to the app) — that is why they work without focus tricks.

## Guardrails (live session)

- Keys land on whatever window is focused — this is the user's real desktop. Agree a hands-off window with the user before sending input, and keep bursts short.
- Destructive keys (`ctrl+w`, `ctrl+q`, bare `super`) are only sent with an agreed target; the default is to hold off.
- Element targets only for clicks — pointer/coordinate clicks would move the real mouse.
- Experiments run on scratch fixtures (unique app name, own profile or scratch file), cleaned up after; see [references/scratch-targets.md](references/scratch-targets.md).

## Gotchas

- **Name ambiguity**: two instances of one app (e.g. two browser profiles) resolve to the first-registered AT-SPI app, not the focused one. Check the `Window:` line in `get_app_state` output before acting on it.
- **Focus wedge**: niri can end up with no focused window — then `wtype` and every synthetic input no-op silently. Check `niri msg focused-window`; if it reports none, the user clicks once to clear it.
- **Stale state**: after the target window moves, closes, or changes much, re-run `get_app_state` before trusting an element index.
