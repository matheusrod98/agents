---
name: git-worktree
description: >
  Worktree-first branch development with Worktrunk (`wt`). Load before creating,
  switching, merging, or deleting a Git branch; making a feature branch; or
  creating, switching, merging, or removing a worktree. Use this skill whenever
  branch work is about to begin. Deep reference: the worktrunk skill.
compatibility: Requires the `wt` CLI (https://worktrunk.dev)
---

# Git Worktree

Develop every branch in its own worktree. Keep the main checkout on its default
branch and use **Worktrunk** (`wt`) for the complete branch and worktree
lifecycle. `wt` keeps worktree paths, branches, and hooks aligned: raw
`git worktree add` produces non-canonical paths and skips the project's lifecycle
hooks (pre-start, post-start, pre-merge...).

## Core commands

Use these commands for branch and worktree operations:

| Task | Command |
| --- | --- |
| Create a branch and its worktree | `wt switch --create <branch>` |
| Switch to a branch's worktree | `wt switch <branch>` |
| Merge a branch into the default branch, removing its worktree | `wt merge <branch>` |
| Remove a worktree (deletes the branch if merged) | `wt remove <branch>` |
| List worktrees | `wt list` |

Work inside the feature worktree, not the main checkout: after `wt switch --create`, the new branch's directory is the working directory — confirm with `wt list` if unsure. Complete the branch step only after the current directory is the feature worktree.

## When a command asks for approval

Hooks from `.config/wt.toml` run only after the user approves them. If a `wt` command fails with a non-interactive approval error, stop and let the user run `wt config approvals add` — approving project hooks is the user's trust decision, not the agent's.

## Deep reference: worktrunk

The **worktrunk** skill holds the full reference — hooks, config, aliases, agent handoffs, troubleshooting. Load it when the task touches those.
