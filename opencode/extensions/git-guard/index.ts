/**
 * Git Interceptor — opencode V1 plugin.
 *
 * Loaded from the `plugin` array in opencode/opencode.json (absolute file
 * path; opencode resolves local paths since 1.x). V1 plugin API (opencode
 * 1.x). OpenCode 2.0 (beta) has a breaking plugin API and needs a separate
 * adapter.
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
 *   B3 (host-controlled worktrees):
 *      branch switching and worktree mutations are redirected to host-side
 *      Worktrunk.
 */

import type { Plugin } from "@opencode-ai/plugin";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { blockedGitOperation } = require("./policy.cjs") as {
  blockedGitOperation(command: string): string | null;
};
const NO_VERIFY_RE = /--no-verify\b/;
const BLOCK_REASON =
  "BLOCKED: --no-verify is not allowed. Git hooks exist for a reason. Do not attempt to bypass them. Instead: fix the underlying issue that is causing the hook to fail, or ask the user for help.";
const WORKTRUNK_BLOCK_REASON =
  "BLOCKED: Agent-managed branch and worktree changes are disabled. Ask the user to run the operation with host-side Worktrunk (for example, `wt switch --create <branch>`) and continue in the resulting worktree.";

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
      if (blockedGitOperation(command)) {
        throw new Error(WORKTRUNK_BLOCK_REASON);
      }
    },
  });
};