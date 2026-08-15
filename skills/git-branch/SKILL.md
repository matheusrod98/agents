---
name: git-branch
description: >
  Always develop in a git worktree, never in the main checkout. Load when about to
  create, switch, merge, or delete a branch — "make a branch", "checkout -b",
  "git switch", "start a new feature", "merge into main", "delete branch". Worktree
  mechanics live in the git-worktree skill.
next: git-worktree
---

# Git Branch

Every branch develops in its own worktree. The main checkout stays on the default branch: never create a branch there, never commit there.

## Rule

When the task says branch, it means worktree:

- Create a branch → create its worktree first, then work inside it.
- Switch to a branch → switch to its worktree.
- Merge a branch → merge it, which also removes its worktree.
- Delete a branch → remove its worktree.

Never run `git branch`, `git checkout -b`, or `git switch` in the main checkout — worktree commands replace them all.

## Next: git-worktree

Worktrees are created and managed with worktrunk (`wt`), never raw `git worktree`. Load the **git-worktree** skill for the commands.
