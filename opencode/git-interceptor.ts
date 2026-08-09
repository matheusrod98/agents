/**
 * Git Interceptor — opencode V1 plugin, port of the pi extension
 * (~/.agents/.pi/agent/extensions/git-interceptor.ts).
 *
 * Loaded from the `plugin` array in opencode/opencode.json (absolute file
 * path; opencode resolves local paths since 1.x). V1 plugin API (opencode
 * 1.x). OpenCode 2.0 (beta) has a breaking plugin API and needs a separate
 * adapter.
 *
 * Policy constants are the contract — keep verbatim in sync with
 * codex/git-guard.cjs and claude-code/git-guard.cjs.
 *
 * Event mapping (in-process, no shell shims):
 *   B1 (no interactive git editors):
 *      "shell.env" hook — unconditionally pins
 *      GIT_EDITOR/GIT_SEQUENCE_EDITOR/GIT_MERGE_AUTOEDIT for every shell
 *      execution (Bash tool calls AND user /shell terminals). Unconditional:
 *      an inherited GIT_EDITOR=nvim must be overridden, not preserved.
 *   B2 (block --no-verify):
 *      throwing from "tool.execute.before" aborts the tool call; the model
 *      receives "Tool execution failed: <reason>". Only the deliberate deny
 *      throws — a broken guard must not look like a deny.
 */

import type { Plugin } from "@opencode-ai/plugin";

const NO_VERIFY_RE = /--no-verify\b/;
const BLOCK_REASON =
  "BLOCKED: --no-verify is not allowed. Git hooks exist for a reason. Do not attempt to bypass them. Instead: fix the underlying issue that is causing the hook to fail, or ask the user for help.";

export const GitInterceptor: Plugin = async ({ project }) => {
  project.apply({
    name: "git-interceptor",
    "shell.env": async (_input, output) => {
      // B1: pin git editor env for every shell execution (bash tool + /shell).
      output.env.GIT_EDITOR = "true";
      output.env.GIT_SEQUENCE_EDITOR = "true";
      output.env.GIT_MERGE_AUTOEDIT = "no";
    },
    "tool.execute.before": async (input) => {
      // B2: block --no-verify in agent shell commands.
      if (input.tool !== "bash") return;
      const command = input.args && typeof input.args.command === "string" ? input.args.command : null;
      if (command === null) return;
      if (command.includes("git") && NO_VERIFY_RE.test(command)) {
        throw new Error(BLOCK_REASON);
      }
    },
  });
};