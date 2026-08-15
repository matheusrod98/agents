"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { spawnSync } = require("node:child_process");
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

function run(command) {
  return spawnSync(process.execPath, [path.join(__dirname, "index.cjs")], {
    input: JSON.stringify({ tool_name: "Bash", tool_input: { command } }),
    encoding: "utf8",
  });
}

test("denies Worktrunk-owned operations", () => {
  const result = run("command git checkout main");
  assert.equal(result.status, 0);
  const output = JSON.parse(result.stdout);
  assert.equal(output.hookSpecificOutput.permissionDecision, "deny");
  assert.match(output.hookSpecificOutput.permissionDecisionReason, /Worktrunk/);
});

test("preserves hook-bypass denial and read-only Git", () => {
  assert.match(JSON.parse(run("git commit --no-verify").stdout).hookSpecificOutput.permissionDecisionReason, /--no-verify/);
  assert.equal(run("git branch --list").stdout, "");
});
