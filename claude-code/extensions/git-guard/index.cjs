#!/usr/bin/env node
"use strict";
// Git interceptor for Claude Code — PreToolUse hook (matcher "Bash"). Wired
// in claude-code/settings.json; requires claude >= 2.0.10.
//
//   B1  git env pins are provided by the "env" block in settings.json — NOT
//       via updatedInput, which would auto-approve the permission prompt for
//       every git command (a side effect pi does not have).
//   B2  `--no-verify` (only when the command mentions git) -> deny JSON; the
//       permissionDecisionReason is shown to Claude.
//   B3  Agent-issued branch switching and worktree mutations -> deny JSON;
//       host-side Worktrunk owns those operations.
//
// Fail open: any error (bad JSON, wrong shape) leaves the tool call untouched.

const { blockedGitOperation } = require("./policy.cjs");
const NO_VERIFY_RE = /--no-verify\b/;
const BLOCK_REASON =
  "BLOCKED: --no-verify is not allowed. Git hooks exist for a reason. Do not attempt to bypass them. Instead: fix the underlying issue that is causing the hook to fail, or ask the user for help.";
const WORKTRUNK_BLOCK_REASON =
  "BLOCKED: Agent-managed branch and worktree changes are disabled. Ask the user to run the operation with host-side Worktrunk (for example, `wt switch --create <branch>`) and continue in the resulting worktree.";

let input = "";
process.stdin.on("data", (c) => (input += c));
process.stdin.on("end", () => {
  try {
    const evt = JSON.parse(input);
    const cmd = evt?.tool_input?.command;
    if (evt?.tool_name !== "Bash" || typeof cmd !== "string") return;

    const reason = cmd.includes("git") && NO_VERIFY_RE.test(cmd)
      ? BLOCK_REASON
      : blockedGitOperation(cmd)
        ? WORKTRUNK_BLOCK_REASON
        : null;
    if (reason) {
      process.stdout.write(
        JSON.stringify({
          hookSpecificOutput: {
            hookEventName: "PreToolUse",
            permissionDecision: "deny",
            permissionDecisionReason: reason,
          },
        }),
      );
    }
  } catch {
    // Fail open: a broken guard must never block the tool call.
  }
});