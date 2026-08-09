#!/usr/bin/env node
"use strict";
// Git interceptor for Claude Code — PreToolUse hook (matcher "Bash"), port of
// the pi extension (~/.agents/.pi/agent/extensions/git-interceptor.ts). Wired
// in claude-code/settings.json; requires claude >= 2.0.10.
//
// Policy constants are the contract — keep verbatim in sync with
// codex/git-guard.cjs and opencode/git-interceptor.ts.
//
//   B1  git env pins are provided by the "env" block in settings.json — NOT
//       via updatedInput, which would auto-approve the permission prompt for
//       every git command (a side effect pi does not have).
//   B2  `--no-verify` (only when the command mentions git) -> deny JSON; the
//       permissionDecisionReason is shown to Claude.
//
// Fail open: any error (bad JSON, wrong shape) leaves the tool call untouched.

const NO_VERIFY_RE = /--no-verify\b/;
const BLOCK_REASON =
  "BLOCKED: --no-verify is not allowed. Git hooks exist for a reason. Do not attempt to bypass them. Instead: fix the underlying issue that is causing the hook to fail, or ask the user for help.";

let input = "";
process.stdin.on("data", (c) => (input += c));
process.stdin.on("end", () => {
  try {
    const evt = JSON.parse(input);
    const cmd = evt?.tool_input?.command;
    if (evt?.tool_name !== "Bash" || typeof cmd !== "string") return;

    if (cmd.includes("git") && NO_VERIFY_RE.test(cmd)) {
      process.stdout.write(
        JSON.stringify({
          hookSpecificOutput: {
            hookEventName: "PreToolUse",
            permissionDecision: "deny",
            permissionDecisionReason: BLOCK_REASON,
          },
        }),
      );
    }
  } catch {
    // Fail open: a broken guard must never block the tool call.
  }
});