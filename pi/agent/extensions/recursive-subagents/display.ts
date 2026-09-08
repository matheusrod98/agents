import { execFile } from "node:child_process";
import { mkdtempSync, writeFileSync, renameSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import type { TreeSnapshot } from "./runtime.ts";

const run = promisify(execFile);

function quote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** A derived read-only display; native Pi sessions hold the real conversations. */
export class TreeDisplay {
  private directory?: string;
  private paneId?: string;
  private opening?: Promise<void>;
  private timer?: ReturnType<typeof setTimeout>;
  private snapshot?: TreeSnapshot;
  private stopped = false;

  constructor(
    private pi: ExtensionAPI,
    private context: () => ExtensionContext,
  ) {}

  update(snapshot: TreeSnapshot) {
    this.snapshot = snapshot;
    if (!this.directory || this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.flush();
    }, 100);
    this.timer.unref?.();
  }

  private flush() {
    if (!this.directory || !this.snapshot) return;
    try {
      const temporary = join(this.directory, "snapshot.next");
      writeFileSync(temporary, JSON.stringify(this.snapshot), { mode: 0o600 });
      renameSync(temporary, join(this.directory, "snapshot.json"));
    } catch (error) {
      if (!this.stopped)
        this.context().ui.notify(
          `Agent tree display: ${String(error)}`,
          "error",
        );
    }
  }

  async open() {
    if (this.stopped) throw new Error("This root session has shut down.");
    if (process.env.HERDR_ENV !== "1" || !process.env.HERDR_PANE_ID)
      throw new Error(
        "Open /agents from a Herdr-managed Pi pane. No external Herdr session will be controlled.",
      );
    if (this.opening) return this.opening;
    this.opening = this.openPane();
    try {
      await this.opening;
    } finally {
      this.opening = undefined;
    }
  }

  private async command(args: string[]) {
    // Capture Herdr output directly. Pi TUI exec can return empty stdout for the same command.
    try {
      const { stdout, stderr } = await run("herdr", args, {
        timeout: 10000,
        env: process.env,
        encoding: "utf8",
      });
      const text = (stdout || stderr).trim();
      if (!text) return {};
      return JSON.parse(text);
    } catch (error) {
      if (error && typeof error === "object" && "stderr" in error) {
        const detail = String(
          (error as { stderr?: string; stdout?: string }).stderr ||
            (error as { stdout?: string }).stdout ||
            (error as Error).message,
        ).trim();
        throw new Error(detail || `herdr ${args[0]} failed`);
      }
      throw error;
    }
  }

  private async openPane() {
    if (this.paneId) {
      try {
        await this.command(["pane", "get", this.paneId]);
        this.context().ui.notify(
          `Agent tree is in ${this.paneId}. Focus it using Herdr.`,
          "info",
        );
        return;
      } catch {
        this.paneId = undefined;
      }
    }
    this.directory ??= mkdtempSync(join(tmpdir(), "pi-agent-tree-"));
    this.flush();
    const ctx = this.context();
    const direction = process.stdout.columns >= 140 ? "right" : "down";
    const created = await this.command([
      "pane",
      "split",
      "--pane",
      process.env.HERDR_PANE_ID!,
      "--direction",
      direction,
      "--cwd",
      ctx.cwd,
      "--no-focus",
    ]);
    const paneId = created.result?.pane?.pane_id;
    if (typeof paneId !== "string")
      throw new Error("Herdr did not return the created pane identity.");
    this.paneId = paneId;
    try {
      const name =
        this.snapshot?.agents.find(
          (agent) => agent.id === this.snapshot?.rootId,
        )?.name || "Pi";
      await this.command(["pane", "rename", paneId, `Agents · ${name}`]);
      const viewer = join(dirname(fileURLToPath(import.meta.url)), "viewer.ts");
      const args = [
        "pi",
        "--no-extensions",
        "-e",
        viewer,
        "--no-session",
        "--no-skills",
        "--no-prompt-templates",
        "--no-tools",
        "--agent-tree-snapshot",
        join(this.directory, "snapshot.json"),
        "--agent-tree-owned-pane",
        paneId,
      ];
      await this.command(["pane", "run", paneId, args.map(quote).join(" ")]);
      ctx.ui.notify(`Agent tree opened in ${paneId}; focus unchanged.`, "info");
    } catch (error) {
      // Only the just-created pane is ours to clean up after a failed launch.
      await this.command(["pane", "close", paneId]).catch(() => {});
      this.paneId = undefined;
      throw error;
    }
  }

  dispose() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    if (this.snapshot) this.snapshot = { ...this.snapshot, connected: false };
    this.flush();
    // Leave the final read-only view available. Its Pi process exits when the user presses q.
  }
}
