# Repository Guidance

## Boundary

This repository owns the pi coding agent configuration: settings, extensions,
prompts, themes, and skills. The machine repository at `~/.dotfiles` owns
packages, wrappers, secrets, services, and the runtime environment.

Pi consumes local runtimes through executable names on `PATH` and `*_FILE`
session variables exported by the machine repo. Keep package-manager paths and
machine implementation details in `~/.dotfiles`.

Edit source files here. Use `make` to update the installed symlinks rather than
editing files under `~/.pi/agent` directly.

## No MCP

This setup runs without MCP servers or MCP adapters. Services are reached
through CLIs driven over bash and documented in `skills/`. Do not reintroduce
MCP registrations, `.mcp.json`, or MCP packages.

## Validation

- Run `make` after configuration changes; it installs links, the pre-commit
  hook, and runs `scripts/doctor.sh`.
- Run `make doctor` when only the machine runtime changed.
- Keep `scripts/doctor.sh` synchronized with the CLIs the skills rely on
  whenever that set changes.
- Read `README.md` when changing setup, install targets, or the runtime
  contract.

## Skill Updates

After `make skills:update`, review every changed skill file, using a subagent,
and its upstream source for security before committing the update.
