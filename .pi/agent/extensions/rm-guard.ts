/**
 * rm Guard
 *
 * Blocks agent `rm` invocations in bash and tells the agent to use `trash`
 * (trash-cli) instead, so deleted files stay recoverable via `trash-restore`.
 *
 * Also blocks `rmdir` and `unlink` — same permanent-deletion nature.
 *
 * Strategy: one regex matching `rm` only where a command actually starts —
 * at the start of the command or right after a separator (`&&`, `;`, `|`,
 * `(`, newline), optionally after `sudo`/`command`. Words preceded by a
 * plain space (`git rm`, `grep rm`, `echo "rm"`) don't match, so no
 * allowlist is needed.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { isToolCallEventType } from "@earendil-works/pi-coding-agent";

// `rm`/`rmdir`/`unlink` as the command being executed: at the start of the
// line or right after a separator (`&&`, `;`, `|`, `(`, newline), optionally
// after `sudo` (with flags) or `command`. The command word must be followed
// by whitespace or EOL, so `git rm`, `grep rm`, `echo "rm"` and hybrid
// commands like `rm-safe` never match.
const RM_RE = /(^|[;&|(\n{])\s*(?:sudo\s+(?:-\S+\s+)*|command\s+)?(rm|rmdir|unlink)(?=\s|$)/;

const BLOCK_REASON =
	"BLOCKED: the `rm` command (and `rmdir`/`unlink`) permanently deletes " +
	"files and is not allowed. Use `trash` instead — it moves files to the " +
	"trash, keeping them recoverable via `trash-restore`.\n" +
	"Examples: `trash file.txt`, `trash -r dir/`.\n" +
	"Rewrite the command using `trash` and retry.";

export default function (pi: ExtensionAPI) {
	pi.on("tool_call", (event, ctx) => {
		if (!isToolCallEventType("bash", event)) return;

		// Collapse backslash-newline continuations first, so a continuation
		// inside `git rm` (safe) is not misread as a command boundary.
		const command = event.input.command.replace(/\\\n/g, " ");
		const match = RM_RE.exec(command);
		if (!match) return;

		if (ctx.hasUI) {
			ctx.ui.notify(
				`Blocked: \`${match[2]}\` — use \`trash\` instead`,
				"warning",
			);
		}
		return { block: true, reason: BLOCK_REASON };
	});
}