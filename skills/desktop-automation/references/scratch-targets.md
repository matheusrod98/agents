# Scratch targets for input experiments

Testing synthetic input on the live desktop needs a target that cannot damage anything and reports what it received. Two proven fixtures; both are throwaway — build, use, delete.

## GTK event pad (preferred)

A tiny PyGObject window with a uniquely named `GApplication` — AT-SPI lists it under its own name, so OCU targeting is unambiguous. Every key/scroll/click lands in a log file, giving hard receipts.

Requirements: the OCU Python env (PyGObject + GTK typelibs — reuse the `GI_TYPELIB_PATH` and `PATH` from the installed `~/.local/bin/open-computer-use` wrapper) and `GDK_BACKEND` unset (native Wayland is fine for AT-SPI read/act tools; wtype delivers to the focused surface regardless).

Skeleton: a `Gtk.Window` + `Gtk.Entry`, `application_id` like `org.ocuscratch.test`, handlers writing `KP:<keyval>:<state>` / `SCROLL:...` / `CLICK:...` lines plus the entry text to files under `/tmp`. Launch detached, confirm with `niri msg windows` + `ocu call list_apps`, drive it, read the log.

## Isolated browser instance

For Chromium-specific behavior (its AT-SPI tree is the richest real-world target): launch with `--user-data-dir=<scratch> --no-first-run --no-default-browser-check --force-renderer-accessibility --class=<uniquename>`. A data/file URL page with a `keydown` logger writing into a textarea makes key receipts readable via `get_app_state`.

Known limits: AT-SPI reports the app name from the browser product (both instances show as e.g. "Helium") — `--class` only changes the compositor app-id, so name-targeted OCU calls stay ambiguous. Use it only with the focus guard below.

## Focus guard (both fixtures)

Synthetic input goes to the focused surface. Before each input burst: confirm `niri msg windows` marks the fixture `(focused)`, and keep `get_app_state` + input calls inside one `--calls` process so nothing can steal focus mid-run. If the fixture's logged events stay empty while tools report success, stop — check the focus wedge gotcha in SKILL.md before sending anything else.
