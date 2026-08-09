#!/usr/bin/env node
"use strict";
// Git interceptor for Codex — PreToolUse hook (matcher "Bash"), port of the
// pi extension (~/.agents/.pi/agent/extensions/git-interceptor.ts). Wired in
// codex/hooks.json; requires codex >= 0.131.0 for updatedInput mutation.
//
// Policy constants are the contract — keep verbatim in sync with
// claude-code/git-guard.cjs and opencode/git-interceptor.ts.
//
//   B1  git commands get `export GIT_EDITOR=true ...` prepended so git never
//       spawns an interactive editor that hangs the agent. Belt-and-suspenders:
//       [shell_environment_policy] in codex/config.toml pins the same vars.
//   B2  `--no-verify` (only when the command mentions git; block wins over B1)
//       -> exit 2 + reason on stderr; codex surfaces it as
//       "Command blocked by PreToolUse hook: <reason>".
//
// Fail open: any error (bad JSON, wrong shape) leaves the tool call untouched.

const GIT_ENV_PREFIX =
  "export GIT_EDITOR=true GIT_SEQUENCE_EDITOR=true GIT_MERGE_AUTOEDIT=no\n";
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
      process.stderr.write(BLOCK_REASON + "\n");
      process.exit(2);
    }

    if (cmd.includes("git") && !cmd.includes("GIT_EDITOR")) {
      process.stdout.write(
        JSON.stringify({
          hookSpecificOutput: {
            hookEventName: "PreToolUse",
            permissionDecision: "allow",
            // updatedInput replaces the whole tool_input — every field must
            // be preserved.
            updatedInput: { ...evt.tool_input, command: GIT_ENV_PREFIX + cmd },
          },
        }),
      );
    }
  } catch {
    // Fail open: a broken guard must never block the tool call.
  }
});