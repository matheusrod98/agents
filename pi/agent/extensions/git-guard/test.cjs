"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { blockedGitOperation } = require("./policy.cjs");

const blocked = [
  ["git switch feature", "switch"],
  ["git -C repo checkout main", "checkout"],
  ["command git worktree add ../repo.branch branch", "worktree"],
  ["printf done; git branch feature", "branch"],
  ["git branch -d stale", "branch"],
  ["env GIT_OPTIONAL_LOCKS=0 git branch --move old new", "branch"],
];
const allowed = [
  "git status",
  "git branch",
  "git branch --list 'feature/*'",
  "git fetch --all",
  "git rebase main",
  "git merge main",
  "git commit -m test",
  "git push origin HEAD",
];

test("classifies guarded Git operations", () => {
  for (const [command, operation] of blocked) assert.equal(blockedGitOperation(command), operation, command);
  for (const command of allowed) assert.equal(blockedGitOperation(command), null, command);
});

test("Pi adapter applies its local policy", () => {
  const source = readFileSync(path.join(__dirname, "index.ts"), "utf8");
  assert.match(source, /require\("\.\/policy\.cjs"\)/);
  assert.match(source, /blockedGitOperation\(event\.input\.command\)/);
  assert.match(source, /WORKTRUNK_BLOCK_REASON/);
});
