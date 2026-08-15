---
name: git-worktree
description: >
  Create and manage git worktrees with worktrunk (`wt`), never `git worktree`. Load
  when about to create, switch, merge, or remove worktrees — "make me a worktree",
  "switch to branch X", "merge branch", "clean up worktrees" — or when the git-branch
  skill points here. Deep reference: the worktrunk skill.
compatibility: Requires the `wt` CLI (https://worktrunk.dev)
---

# Git Worktree

Use **worktrunk** (`wt`) for every worktree operation — never `git worktree`. `wt` keeps worktree path, branch, and hooks aligned: raw `git worktree add` produces non-canonical paths and skips the project's lifecycle hooks (pre-start, post-start, pre-merge...).

## Core commands

| Task | Command |
| --- | --- |
| Create a branch and its worktree | `wt switch --create <branch>` |
| Switch to a branch's worktree | `wt switch <branch>` |
| Merge a branch into the default branch, removing its worktree | `wt merge <branch>` |
| Remove a worktree (deletes the branch if merged) | `wt remove <branch>` |
| List worktrees | `wt list` |

Work inside the worktree, not the main checkout: after `wt switch --create`, the new branch's directory is the working directory — confirm with `wt list` if unsure.

## When a command asks for approval

Hooks from `.config/wt.toml` run only after the user approves them. If a `wt` command fails with a non-interactive approval error, stop and let the user run `wt config approvals add` — approving project hooks is the user's trust decision, not the agent's.

## Deep reference: worktrunk

The **worktrunk** skill holds the full reference — hooks, config, aliases, agent handoffs, troubleshooting. Load it when the task touches those.
