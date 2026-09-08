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
| `herdr`             | optional live agent-tree split                    |
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

## Recursive subagents

The local `recursive-subagents` extension replaces `pi-subagents`. It uses
Pi's bundled SDK (validated with Pi 0.84.4); no extra npm runtime or daemon is
required. Start a fresh Pi session after installing with `make`. Do not reload
an active legacy orchestration merely to switch extensions.

- `subagent` supports `spawn`, `list`, `message`, `interrupt`, and `close`.
  Spawn takes a task and name, with optional `model` (`provider/model:thinking`)
  and `cwd`. It returns a native session ID immediately; model/provider and
  thinking default to the parent. Children can recursively use the same tools.
- Responses arrive automatically through native Pi steering. A settled response
  means the agent stopped responding, **not** that its task succeeded. There is
  no wait tool or need to poll. Every conversation remains usable while its
  descendants work.
- `ask_parent` returns a pending question reference immediately. Children ask
  their immediate parent; the root opens native user input. `answer_question`
  replies to a request addressed to that agent. A parent can escalate with its
  own `ask_parent`, then relay the answer. Dismissing user input leaves the
  question pending; `/agents answer <question-id>` opens it again.
- `/agents` opens one named, read-only Herdr split without changing focus.
  Arrow keys select/fold the recursive tree; Page Up/Down scroll retained
  details. `q` closes only that display pane, not the agents. No child tabs,
  panes, or direct child chat editors are created. Outside Herdr, delegation
  still works and `/agents` explains that the separate view needs Herdr.
- Native Pi sessions own identity, names, history, compaction, and parent links.
  `/resume` in Threaded mode shows the hierarchy with an empty search. Use All
  scope when descendants work in other directories. Pi creates a new session's
  file after its first assistant entry, so a failed pre-model startup may have
  only its allocation receipt in the parent.

### Child capabilities

`pi/agent/extensions/recursive-subagents/child-extensions.json` selects work
extensions explicitly. The shipped list contains `npm:pi-web-access`, exposing
`web_search`, `source_check`, `fetch_content`, and `get_search_content`, alongside
Pi's coding/search tools and recursive communication. Native skills, context
files, settings, provider registrations, authentication, retry, and compaction
are reused. Runtime-only root API keys are resolved through the native root
registry, including authentication headers, endpoint, and environment metadata;
credentials are not copied into session history or persisted by this extension.
Children have separate SDK session state; the extension does not change
process-wide cwd or environment.

To add a work extension, install/enable it through Pi normally, then add its
exact configured package source to `sources`, or a discovered local extension
path (relative paths resolve from the child's cwd). Remove an entry to exclude
it; an empty list intentionally selects only built-ins and communication.
Missing/disabled resources and loading errors are reported instead of silently
removing tools. Do not add a competing subagent coordinator.

Equally capable does not mean identical UI extensions. Parent dashboards/todo
overlays, the background-task manager, Plannotator, and direct user-question
extensions are not selected. Existing root extensions (including the root's
`ask_user_question` tool) remain unchanged; the new delegation API uses
`ask_parent`, and children do not load the root's direct-user question tool.
Child extensions run with `hasUI=false`. Explicit
attempts to open a dialog/custom terminal UI fail with guidance to use
`ask_parent`; no answer or approval is fabricated. Work extensions must support
headless operation and session-local state. Arbitrary third-party extensions
can still use process globals or require a terminal; this is not a sandbox or a
promise of compatibility with every extension.

### Lifetime and demo

SDK children live in the owning root process. Quitting, reloading, or replacing
that root runtime interrupts its live descendants and cleans up their resources;
their native conversations remain available. Interrupt targets one child and
clears its queued continuation, while close also disposes that child. Neither
implicitly stops grandchildren. If a surviving descendant reports to a closed
parent, its result remains in its session and an undeliverable-result notice is
recorded at the root instead of restarting the parent or throwing from the SDK
completion handler. There is no custom reboot recovery, tree
resurrection, automatic retry of interrupted operations, or cross-process
resume coordinator. The display is a derived, private temporary snapshot, not
a second conversation database. It remains readable when the root disconnects.

For the demo, after the user is ready: start a fresh Pi in Herdr, open `/agents`,
then ask it to delegate a small research task and have that child delegate a
subtask and ask its parent a question. Keep talking to the root while the tree
updates. The implementation does not launch this demo automatically.

The approved local spec is `.scratch/recursive-subagents/spec.md`. Tests are
explicitly deferred by the user; validation uses bounded manual SDK/UI smoke
checks and `make`/doctor.

## Docker Sandboxes

The `docker-sandboxes` skill teaches agents to work inside isolated `sbx`
microVMs (direct vs clone mode, templates/kits, credentials). `sbx` is a
runtime dependency provided by the machine configuration on `PATH`; `make
doctor` checks for it. The `~/.ssh/config` `*.sbx` block is reproduced
declaratively in the machine repo — do not run `sbx setup ssh` by hand.
