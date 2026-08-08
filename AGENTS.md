# Repository Guidance

## Boundary

This repository owns agent-facing content: settings, skills, prompts, themes,
and MCP registrations. The machine repository at `~/.dotfiles` owns packages,
wrappers, secrets, services, and runtime environment.

Agent configs consume local runtimes through executable names on `PATH` and
documented environment variables. Keep package-manager paths and machine
implementation details in `~/.dotfiles`.

Edit source files here. Use `make` to update the installed projections rather
than editing files under agent config directories directly.

## Validation

- Run `make` after configuration changes; it installs links and runs `doctor.sh`.
- Run `make doctor` when only the machine runtime changed.
- Keep `doctor.sh` synchronized with local stdio MCP servers and their runtime
  dependencies whenever the MCP registry changes.
- Playwright MCP requires `PLAYWRIGHT_MCP_EXECUTABLE_PATH` in the environment.
- Read `README.md` when changing setup, install targets, or the runtime contract.

## Skill Updates

After `make skills:update`, review every changed skill file, using a subagent, and its upstream
source for security before committing the update.
