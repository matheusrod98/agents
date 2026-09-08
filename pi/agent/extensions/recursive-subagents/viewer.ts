import { execFile } from "node:child_process";
import { readFileSync, watch } from "node:fs";
import { dirname } from "node:path";
import { promisify } from "node:util";
import {
  matchesKey,
  truncateToWidth,
  wrapTextWithAnsi,
  type Component,
} from "@earendil-works/pi-tui";
import type { ExtensionAPI, Theme } from "@earendil-works/pi-coding-agent";
import type { AgentRow, TreeSnapshot } from "./runtime.ts";

const run = promisify(execFile);

// Snapshot text is agent-controlled. Strip terminal controls before applying our own styling.
function plain(text: string): string {
  return text
    .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, "")
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, "");
}

export class TreeView implements Component {
  private selected = 0;
  private scroll = 0;
  private collapsed = new Set<string>();
  private error?: string;
  constructor(
    private snapshot: TreeSnapshot,
    private theme: Theme,
    private rows: () => number,
  ) {}
  update(snapshot: TreeSnapshot) {
    this.snapshot = snapshot;
    this.error = undefined;
  }
  setError(error: string) {
    this.error = error;
  }
  invalidate() {}

  private flattened() {
    const result: Array<{ agent: AgentRow; prefix: string }> = [];
    const walk = (
      id: string,
      prefix: string,
      branch: string,
      seen: Set<string>,
    ) => {
      if (seen.has(id)) return;
      seen.add(id);
      const agent = this.snapshot.agents.find((row) => row.id === id);
      if (!agent) return;
      result.push({ agent, prefix: prefix + branch });
      if (this.collapsed.has(id)) return;
      const children = this.snapshot.agents.filter(
        (row) => row.parentId === id,
      );
      children.forEach((child, index) =>
        walk(
          child.id,
          prefix + (branch ? (branch === "└─ " ? "   " : "│  ") : ""),
          index === children.length - 1 ? "└─ " : "├─ ",
          new Set(seen),
        ),
      );
    };
    walk(this.snapshot.rootId, "", "", new Set());
    return result;
  }

  handleInput(data: string) {
    const flat = this.flattened();
    this.selected = Math.min(this.selected, Math.max(0, flat.length - 1));
    if (matchesKey(data, "up") || data === "k") {
      this.selected = Math.max(0, this.selected - 1);
      this.scroll = 0;
    }
    if (matchesKey(data, "down") || data === "j") {
      this.selected = Math.min(flat.length - 1, this.selected + 1);
      this.scroll = 0;
    }
    const selected = flat[this.selected]?.agent;
    if (selected && matchesKey(data, "left")) this.collapsed.add(selected.id);
    if (selected && matchesKey(data, "right"))
      this.collapsed.delete(selected.id);
    if (matchesKey(data, "pageUp")) this.scroll += 8;
    if (matchesKey(data, "pageDown"))
      this.scroll = Math.max(0, this.scroll - 8);
  }

  render(width: number): string[] {
    const height = Math.max(6, this.rows() - 7);
    const flat = this.flattened();
    this.selected = Math.max(0, Math.min(this.selected, flat.length - 1));
    const working = this.snapshot.agents.filter(
      (a) => a.activity === "working" || a.activity === "starting",
    ).length;
    const pending = this.snapshot.questions.filter(
      (q) => q.answer === undefined,
    ).length;
    const lines = [
      this.theme.bold(`Agents · ${working} working · ${pending} questions`),
      this.theme.fg(
        "dim",
        "↑↓ select · ←→ fold · PgUp/PgDn details · q close view",
      ),
    ];
    if (!this.snapshot.connected)
      lines.push(
        this.theme.fg(
          "warning",
          "Root disconnected · saved Pi sessions remain available",
        ),
      );
    if (this.error) lines.push(this.theme.fg("error", plain(this.error)));
    const treeHeight = Math.max(2, Math.floor((height - lines.length) / 2));
    const start = Math.max(0, this.selected - treeHeight + 1);
    for (const [index, row] of flat
      .slice(start, start + treeHeight)
      .entries()) {
      const agent = row.agent;
      const questions = this.snapshot.questions.filter(
        (q) => q.from === agent.id && q.answer === undefined,
      ).length;
      const label = `${index + start === this.selected ? "› " : "  "}${row.prefix}${plain(agent.name).replace(/\s+/g, " ")}${this.collapsed.has(agent.id) ? " [+]" : ""}  ${agent.activity}${questions ? ` · ? ${questions}` : ""}`;
      const color =
        agent.activity === "error"
          ? "error"
          : agent.activity === "working"
            ? "accent"
            : "muted";
      lines.push(this.theme.fg(color, label));
    }
    lines.push(this.theme.fg("border", "─".repeat(Math.max(0, width))));
    const selected = flat[this.selected]?.agent;
    if (selected) {
      const details = [
        selected.name,
        selected.id,
        selected.model || "",
        `Session: ${selected.sessionFile || "ephemeral"}`,
      ];
      for (const q of this.snapshot.questions.filter(
        (q) => q.from === selected.id || q.to === selected.id,
      )) {
        details.push(
          `\nQuestion ${q.id}: ${q.text}`,
          q.answer === undefined ? "Awaiting answer" : `Answer: ${q.answer}`,
        );
      }
      for (const event of selected.history)
        details.push(
          `\n${new Date(event.time).toLocaleTimeString()} · ${event.kind}\n${event.text}`,
        );
      const wrapped = details.flatMap((text) =>
        plain(text)
          .split("\n")
          .flatMap((line) => wrapTextWithAnsi(line, Math.max(1, width))),
      );
      const available = Math.max(1, height - lines.length);
      this.scroll = Math.min(
        this.scroll,
        Math.max(0, wrapped.length - available),
      );
      // Default to the latest events; page up moves back through the retained detail history.
      const end = Math.max(available, wrapped.length - this.scroll);
      lines.push(...wrapped.slice(Math.max(0, end - available), end));
    }
    return lines
      .slice(0, height)
      .map((line) => truncateToWidth(line, Math.max(1, width)));
  }
}

/** Standalone passive viewer, loaded by `pi -e`; no model prompt is ever submitted. */
export default function (pi: ExtensionAPI) {
  pi.registerFlag("agent-tree-snapshot", {
    description: "Private derived agent-tree snapshot",
    type: "string",
  });
  pi.registerFlag("agent-tree-owned-pane", {
    description:
      "Display pane created by the root extension; q closes only this pane",
    type: "string",
  });
  pi.on("session_start", async (_event, ctx) => {
    const path = pi.getFlag("agent-tree-snapshot");
    if (typeof path !== "string" || !path)
      throw new Error("The agent tree viewer requires --agent-tree-snapshot.");
    if (ctx.mode !== "tui")
      throw new Error("The agent tree viewer needs a terminal.");
    const load = () => JSON.parse(readFileSync(path, "utf8")) as TreeSnapshot;
    const initial = load();
    ctx.ui.setTitle("Pi · Agent tree");
    await ctx.ui.custom<void>((tui, theme, _keys, done) => {
      const view = new TreeView(initial, theme, () => tui.terminal.rows);
      const watcher = watch(dirname(path), (_type, filename) => {
        if (filename && filename.toString() !== "snapshot.json") return;
        try {
          view.update(load());
        } catch (error) {
          view.setError(`Display unavailable: ${String(error)}`);
        }
        tui.requestRender();
      });
      watcher.on("error", (error) => {
        view.setError(String(error));
        tui.requestRender();
      });
      return {
        render: (width) => view.render(width),
        invalidate: () => view.invalidate(),
        handleInput: (data) => {
          if (
            data === "q" ||
            matchesKey(data, "escape") ||
            matchesKey(data, "ctrl+c")
          ) {
            watcher.close();
            done();
          } else {
            view.handleInput(data);
            tui.requestRender();
          }
        },
        dispose: () => watcher.close(),
      };
    });
    const ownedPane = pi.getFlag("agent-tree-owned-pane");
    if (
      typeof ownedPane === "string" &&
      process.env.HERDR_ENV === "1" &&
      process.env.HERDR_PANE_ID === ownedPane
    ) {
      try {
        await run("herdr", ["pane", "close", ownedPane], {
          timeout: 5000,
          env: process.env,
          encoding: "utf8",
        });
      } catch (error) {
        const detail =
          error && typeof error === "object" && "stderr" in error
            ? String((error as { stderr?: string }).stderr || error)
            : String(error);
        ctx.ui.notify(`Could not close display pane: ${detail}`, "error");
      }
    }
    ctx.shutdown();
  });
}
