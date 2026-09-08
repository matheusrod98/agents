# pi

Personal configuration for the pi coding agent: settings, extensions, prompts,
themes, and skills, git-iterated and symlinked into place by `make`.

## What's in here

- `skills/` — the skill collection, each with its own `SKILL.md`;
- `pi/` — Pi settings, extensions, prompts, themes, and web-search
  configuration;
- `Makefile` — the installer entrypoint;
- `scripts/` — standalone scripts invoked by `make` targets: `doctor.sh`
  (runtime checks), `skills-update.sh` / `skills-install.sh` (the `skills:*`
  targets).

## Setup

Prerequisites: GNU Make and pi. The repository can be cloned anywhere:

```sh
git clone https://github.com/matheusrod98/agents.git ~/.agents
cd ~/.agents
make
```

The repository's pre-commit hooks use formatting and linting tools supplied by
the machine configuration. Enable them once with `pre-commit install`.

The default target runs `scripts/doctor.sh` and symlinks the Pi resources
(`~/.pi/agent`, `~/.pi/web-search.json`) into place. Subsequent pulls take
effect without reinstalling — links point at the repo.

## Runtime contract

Pi drives services through CLIs referenced by executable name, not by
package-manager or machine-specific paths. The machine configuration
(`~/.dotfiles`) provides the executables on `PATH`:

| CLI                 | purpose                                           |
| ------------------- | ------------------------------------------------- |
| `aws`               | AWS                                               |
| `gh`                | GitHub                                            |
| `glab`              | GitLab (self-hosted: `GITLAB_HOST`)               |
| `gcx`               | Grafana (dashboards, metrics, logs, alerts)       |
| `kubectl`           | Kubernetes                                        |
| `drawio`            | draw.io diagrams (author XML, `drawio -x` export) |
| `ctx7`              | library documentation (Context7)                  |
| `playwright-cli`    | browser automation (Chromium / system Chrome)     |
| `ticktick-cli`      | TickTick                                          |
| `open-computer-use` | desktop control (Linux, AT-SPI2)                  |

Tokens come from `*_FILE` session variables exported by the machine repo (for
example `GITLAB_TOKEN_FILE`); each file holds the raw token. Skills read the
file and pass the value as a per-command environment variable.

Plain `make` runs `scripts/doctor.sh` after installing the links. Run
`make doctor` directly when only the machine runtime changed.

### Make targets

| target                    | action                                                                                                                     |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `make`                    | run `doctor`, install the Pi resources, then install the Git hook                                                          |
| `make pre-commit:install` | install the repository's Git pre-commit hook                                                                               |
| `make doctor`             | verify runtime executables                                                                                                 |
| `make pi`                 | settings, extensions, prompts, themes, skills → `~/.pi/agent`; web-search → `~/.pi`                                        |
| `make skills:update`      | refresh skills managed by `skills.sh`                                                                                      |
| `make skills:install`     | add a skill from `skills.sh` (accepts a package spec or URL, e.g. `make skills:install anthropics/skills@frontend-design`) |

Each Pi resource also installs individually — `pi:settings`, `pi:extensions`,
`pi:prompts`, `pi:themes`, `pi:skills`, `pi:web-search`.

`make skills:update` refreshes skills with entries in `skills-lock.json` and
prompts before removing skills deleted upstream. Local skills without an
upstream source entry remain under this repository's control.

`make skills:install <package|URL>` installs a new skill through the `skills`
CLI inside a throwaway project directory, so only `skills/<name>/` and the
lock entry in `skills-lock.json` are touched — never global agent configs.

## Docker Sandboxes

The `docker-sandboxes` skill teaches agents to work inside isolated `sbx`
microVMs (direct vs clone mode, templates/kits, credentials). `sbx` is a
runtime dependency provided by the machine configuration on `PATH`; `make
doctor` checks for it. The `~/.ssh/config` `*.sbx` block is reproduced
declaratively in the machine repo — do not run `sbx setup ssh` by hand.
