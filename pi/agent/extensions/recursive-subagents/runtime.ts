import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import {
  createAgentSession,
  defineTool,
  getAgentDir,
  ModelRuntime,
  resolveCliModel,
  SessionManager,
  SettingsManager,
  truncateHead,
  type AgentSession,
  type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import { childResources } from "./child-resources.ts";

export const MESSAGE_TYPE = "recursive-subagents";
export type Activity =
  "starting" | "working" | "idle" | "error" | "interrupted" | "closed";
export interface HistoryItem {
  kind: string;
  text: string;
  time: number;
}
export interface AgentRow {
  id: string;
  parentId?: string;
  name: string;
  cwd: string;
  sessionFile?: string;
  activity: Activity;
  model?: string;
  history: HistoryItem[];
}
export interface Question {
  id: string;
  from: string;
  to: string;
  text: string;
  answer?: string;
}
export interface TreeSnapshot {
  rootId: string;
  connected: boolean;
  agents: AgentRow[];
  questions: Question[];
}
interface LiveAgent extends AgentRow {
  session?: AgentSession;
  manager?: SessionManager;
  ready?: Promise<void>;
  cleanup?: () => void;
  lastAssistant?: { text: string; stopReason: string; errorMessage?: string };
}
export interface RootHost {
  context(): ExtensionContext;
  send(
    content: string,
    details: Record<string, unknown>,
    triggerTurn: boolean,
  ): void;
  record(data: unknown): void;
  changed(snapshot: TreeSnapshot): void;
}
const brief = `You are a Pi subagent. Work on your assigned task autonomously. You may delegate recursively using subagent; spawning never waits for completion. Give children concrete briefs. Results arrive automatically: do not poll, sleep, or keep generating merely to wait. You may finish your response while children work. Use ask_parent for missing guidance, then continue independent work or go idle. Use answer_question to answer questions addressed to you; if unsure, use your own ask_parent and relay the answer. Questions and answers are asynchronous. A settled response is not proof that a task succeeded. Report failures, partial work, and remaining children honestly. You have Pi built-in tools, skills, project context, and explicitly selected work extensions. Interactive-only extensions are not loaded. If a tool requests unsupported UI, explain the needed interaction with ask_parent; never fabricate an answer. These sessions share the filesystem, not a sandbox. Coordinate edits yourself.`;

function textResult(value: unknown) {
  const text =
    typeof value === "string" ? value : JSON.stringify(value, null, 2);
  const truncated = truncateHead(text);
  return {
    content: [
      {
        type: "text" as const,
        text:
          truncated.content +
          (truncated.truncated
            ? "\n[Truncated; inspect the referenced native session for full history.]"
            : ""),
      },
    ],
    details: {},
  };
}
function messageText(message: { content?: unknown }): string {
  if (typeof message.content === "string") return message.content;
  if (!Array.isArray(message.content)) return "";
  return message.content
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n");
}
function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** One live root owns SDK descendants; session JSONL remains the conversation authority. */
export class AgentTree {
  readonly rootId: string;
  private agents = new Map<string, LiveAgent>();
  private questions = new Map<string, Question>();
  private modelRuntime?: Promise<ModelRuntime>;
  private disposed = false;
  private userDialog?: AbortController;
  private userQuestions: string[] = [];
  private askingUser = false;

  constructor(private host: RootHost) {
    const ctx = host.context();
    this.rootId = ctx.sessionManager.getSessionId();
    this.agents.set(this.rootId, {
      id: this.rootId,
      name: ctx.sessionManager.getSessionName() || "Main Pi",
      cwd: ctx.cwd,
      sessionFile: ctx.sessionManager.getSessionFile(),
      activity: ctx.isIdle() ? "idle" : "working",
      history: [],
      model: ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : undefined,
    });
  }

  snapshot(): TreeSnapshot {
    return {
      rootId: this.rootId,
      connected: !this.disposed,
      agents: [...this.agents.values()].map(
        ({
          session: _session,
          manager: _manager,
          ready: _ready,
          cleanup: _cleanup,
          lastAssistant: _last,
          ...row
        }) => ({ ...row, history: [...row.history] }),
      ),
      questions: [...this.questions.values()].map((question) => ({
        ...question,
      })),
    };
  }
  private changed() {
    this.host.changed(this.snapshot());
  }
  private get(id: string): LiveAgent {
    const row = this.agents.get(id);
    if (!row)
      throw new Error(
        `Unknown live session ${id}. Use subagent list for session references.`,
      );
    return row;
  }
  private note(id: string, kind: string, text: string) {
    const row = this.get(id);
    row.history.push({ kind, text: text.slice(0, 16000), time: Date.now() });
    if (row.history.length > 40) row.history.shift();
    this.changed();
  }
  rootActivity(activity: Activity) {
    const root = this.get(this.rootId);
    if (
      activity !== "idle" ||
      (root.activity !== "error" && root.activity !== "interrupted")
    )
      root.activity = activity;
    this.changed();
  }
  rootName(name?: string) {
    this.get(this.rootId).name = name || "Main Pi";
    this.changed();
  }
  rootMessage(kind: string, text: string) {
    if (text) this.note(this.rootId, kind, text);
  }

  tools(owner: string) {
    return [
      defineTool({
        name: "subagent",
        label: "Subagent",
        description:
          "Spawn recursive Pi SDK sessions asynchronously, list the live tree, message a session, interrupt work, or close a child. Spawn returns immediately after allocating a session; results arrive automatically. Never poll to wait. Names are display labels; target the returned session ID. Output is truncated at Pi's normal limit; full conversations remain in the referenced native sessions.",
        parameters: Type.Object({
          action: StringEnum([
            "spawn",
            "list",
            "message",
            "interrupt",
            "close",
          ] as const),
          name: Type.Optional(Type.String({ minLength: 1, maxLength: 120 })),
          task: Type.Optional(Type.String({ minLength: 1 })),
          sessionId: Type.Optional(Type.String()),
          message: Type.Optional(Type.String({ minLength: 1 })),
          model: Type.Optional(
            Type.String({
              description:
                "Optional native provider/model[:thinking] selector. Default: inherit parent.",
            }),
          ),
          cwd: Type.Optional(
            Type.String({
              description:
                "Optional existing working directory; defaults to parent's cwd.",
            }),
          ),
        }),
        execute: async (_callId, params) => {
          if (this.disposed)
            throw new Error("The owning root session has shut down.");
          if (params.action === "spawn") {
            if (!params.name || !params.task)
              throw new Error("spawn requires name and task.");
            return textResult(
              this.spawn(
                owner,
                params.name,
                params.task,
                params.model,
                params.cwd,
              ),
            );
          }
          if (params.action === "list") return textResult(this.snapshot());
          if (!params.sessionId)
            throw new Error(`${params.action} requires sessionId.`);
          if (params.action === "message") {
            if (!params.message)
              throw new Error("message requires message text.");
            this.deliver(owner, params.sessionId, "message", params.message);
            return textResult(
              "Message queued through Pi. The session's next settled response will be delivered to its parent.",
            );
          }
          if (params.sessionId === this.rootId || params.sessionId === owner)
            throw new Error(
              "Use the normal Pi controls for this session; this operation targets another child.",
            );
          const target = this.get(params.sessionId);
          await target.ready;
          if (!target.session)
            throw new Error(
              "This child is not running; its saved session remains available in Pi.",
            );
          // Interrupt one conversation, not its descendants. Drop queued messages so abort does not restart it.
          target.session.clearQueue();
          await target.session.abort();
          target.activity =
            params.action === "close" ? "closed" : "interrupted";
          this.note(
            target.id,
            target.activity,
            `${this.get(owner).name} requested ${params.action}.`,
          );
          if (params.action === "close") {
            await target.session.extensionRunner.emit({
              type: "session_shutdown",
              reason: "quit",
            });
            target.session.dispose();
            target.session = undefined;
            target.cleanup?.();
          }
          return textResult({
            sessionId: target.id,
            activity: target.activity,
            sessionFile: target.sessionFile,
          });
        },
      }),
      defineTool({
        name: "ask_parent",
        label: "Ask parent",
        description:
          "Ask your immediate parent for guidance; at the root, ask the user. Returns immediately with a question reference. Continue independent work or go idle; an answer will arrive asynchronously. To escalate a child's question, call ask_parent yourself, then relay the answer with answer_question.",
        parameters: Type.Object({ question: Type.String({ minLength: 1 }) }),
        execute: async (_callId, { question }) =>
          textResult(this.ask(owner, question)),
      }),
      defineTool({
        name: "answer_question",
        label: "Answer question",
        description:
          "Reply to a question addressed to this session. The answer is delivered to the asking session through Pi's message queue. Use the question reference in the received message.",
        parameters: Type.Object({
          questionId: Type.String(),
          answer: Type.String({ minLength: 1 }),
        }),
        execute: async (_callId, { questionId, answer }) => {
          this.answer(owner, questionId, answer);
          return textResult("Answer queued to the asking session.");
        },
      }),
    ];
  }

  private spawn(
    parentId: string,
    name: string,
    task: string,
    selector?: string,
    directory?: string,
  ) {
    const parent = this.get(parentId);
    if (!parent.sessionFile)
      throw new Error(
        "Delegation requires a persisted parent session. Start Pi without --no-session.",
      );
    const cwd = directory ? resolve(parent.cwd, directory) : parent.cwd;
    const manager = SessionManager.create(cwd);
    manager.newSession({ parentSession: parent.sessionFile });
    manager.appendSessionInfo(name);
    const child: LiveAgent = {
      id: manager.getSessionId(),
      parentId,
      name,
      cwd,
      sessionFile: manager.getSessionFile(),
      activity: "starting",
      history: [],
      manager,
    };
    this.agents.set(child.id, child);
    this.host.record({
      kind: "child",
      sessionId: child.id,
      parentId,
      sessionFile: child.sessionFile,
      name,
    });
    this.note(child.id, "assignment", task);
    child.ready = this.start(child, task, selector).catch((error) =>
      this.fail(child, error),
    );
    return {
      sessionId: child.id,
      sessionFile: child.sessionFile,
      parentId,
      name,
      activity: "starting",
      notice:
        "Work is asynchronous. Continue or go idle; results arrive automatically.",
    };
  }

  private async createModelRuntime() {
    const runtime = await ModelRuntime.create();
    // Reuse native credentials/catalogs and the root's provider registrations without loading child extensions.
    const registry = this.host.context().modelRegistry;
    for (const id of registry.getRegisteredProviderIds()) {
      const provider = registry.getRegisteredNativeProvider(id);
      const config = registry.getRegisteredProviderConfig(id);
      if (provider) runtime.registerNativeProvider(provider);
      else if (config) runtime.registerProvider(id, config);
    }
    // Runtime-only keys (for example --api-key) never reach auth.json. Resolve
    // them through the root on every request, including headers/baseUrl/env.
    for (const provider of runtime.getProviders()) {
      if (registry.getProviderAuthStatus(provider.id).source !== "runtime")
        continue;
      const auth = await registry.getProviderAuth(provider.id);
      if (!auth?.auth.apiKey)
        throw new Error(
          `Root runtime authentication unavailable for ${provider.id}.`,
        );
      runtime.registerNativeProvider({
        ...provider,
        auth: {
          ...provider.auth,
          apiKey: {
            name: "Root session authentication",
            resolve: () => registry.getProviderAuth(provider.id),
          },
        },
      });
      // Prefer the inherited runtime credential over any stored OAuth entry.
      await runtime.setRuntimeApiKey(provider.id, auth.auth.apiKey);
    }
    return runtime;
  }

  private async start(child: LiveAgent, task: string, selector?: string) {
    this.modelRuntime ??= this.createModelRuntime();
    const modelRuntime = await this.modelRuntime;
    const parent = this.get(child.parentId!);
    const ctx = this.host.context();
    let model = parent.session?.model ?? ctx.model;
    let thinkingLevel = parent.session?.thinkingLevel ?? ctx.thinkingLevel;
    if (selector) {
      const resolved = resolveCliModel({ cliModel: selector, modelRuntime });
      if (resolved.error) throw new Error(resolved.error);
      model = resolved.model;
      thinkingLevel = resolved.thinkingLevel ?? thinkingLevel;
      if (resolved.warning) this.note(child.id, "model", resolved.warning);
    }
    if (!model) throw new Error("No model configured for this child.");
    if (this.disposed) return;
    const settingsManager = SettingsManager.create(child.cwd, getAgentDir());
    settingsManager.setProjectTrusted(ctx.isProjectTrusted());
    const { loader, eventBus } = await childResources(
      child.cwd,
      settingsManager,
      brief,
    );
    child.cleanup = () => eventBus.clear();
    if (this.disposed) return;
    const { session } = await createAgentSession({
      cwd: child.cwd,
      model,
      thinkingLevel,
      modelRuntime,
      settingsManager,
      resourceLoader: loader,
      sessionManager: child.manager,
      tools: [
        "read",
        "bash",
        "edit",
        "write",
        "grep",
        "find",
        "ls",
        "subagent",
        "ask_parent",
        "answer_question",
        ...loader
          .getExtensions()
          .extensions.flatMap((extension) => [...extension.tools.keys()]),
      ],
      customTools: this.tools(child.id),
    });
    if (this.disposed) {
      session.dispose();
      return;
    }
    child.session = session;
    child.model = `${session.model?.provider}/${session.model?.id}`;
    await session.bindExtensions({
      mode: "print",
      onError: (event) => {
        this.note(
          child.id,
          "extension error",
          `${event.extensionPath}: ${event.error}`,
        );
        this.report(
          child,
          "extension error",
          `${event.extensionPath}: ${event.error}`,
        );
      },
    });
    this.note(child.id, "tools", session.getActiveToolNames().join(", "));
    session.subscribe((event) => {
      if (this.disposed) return;
      if (event.type === "agent_start") {
        child.activity = "working";
        child.lastAssistant = undefined;
        this.changed();
      }
      if (event.type === "tool_execution_start")
        this.note(child.id, "tool", event.toolName);
      if (event.type === "tool_execution_end" && event.isError)
        this.note(child.id, "tool error", messageText(event.result));
      if (event.type === "message_end" && event.message.role === "assistant") {
        child.lastAssistant = {
          text: messageText(event.message),
          stopReason: event.message.stopReason,
          errorMessage: event.message.errorMessage,
        };
        if (child.lastAssistant.text)
          this.note(child.id, "response", child.lastAssistant.text);
      }
      if (event.type === "message_end" && event.message.role === "custom")
        this.note(child.id, "received", messageText(event.message));
      if (event.type === "auto_retry_start")
        this.note(child.id, "retry", event.errorMessage);
      if (event.type === "compaction_start")
        this.note(child.id, "compaction", "Pi is compacting the conversation.");
      if (event.type === "agent_settled" && session.isIdle) this.settled(child);
    });
    // The prompt promise spans the whole run; deliberately do not await it in spawn/start.
    void session.prompt(task).catch((error) => this.fail(child, error));
  }

  private settled(child: LiveAgent) {
    const last = child.lastAssistant;
    child.activity =
      last?.stopReason === "error"
        ? "error"
        : last?.stopReason === "aborted"
          ? "interrupted"
          : "idle";
    this.changed();
    const pending = [...this.questions.values()].filter(
      (q) => q.from === child.id && q.answer === undefined,
    );
    const body = [
      `Response settled (${child.activity}); this is not a task-success assertion.`,
      last?.errorMessage,
      last?.text || "No final text response.",
      pending.length
        ? `Outstanding question references: ${pending.map((q) => q.id).join(", ")}`
        : undefined,
      `Session: ${child.sessionFile}`,
    ]
      .filter(Boolean)
      .join("\n\n");
    this.report(child, "response", body);
  }

  private fail(child: LiveAgent, error: unknown) {
    if (this.disposed) return;
    child.activity = "error";
    const text = errorText(error);
    try {
      this.note(child.id, "error", text);
      child.manager?.appendCustomEntry(MESSAGE_TYPE, { kind: "error", text });
    } catch (recordError) {
      console.error("Subagent error recording failed:", errorText(recordError));
    }
    this.report(child, "error", `${text}\nSession: ${child.sessionFile}`);
  }

  /** Automatic reports must survive an immediate parent's independent closure. */
  private report(child: LiveAgent, kind: string, text: string) {
    if (this.disposed) return;
    try {
      this.deliver(child.id, child.parentId!, kind, text);
    } catch (error) {
      this.deliveryFailed(child.id, child.parentId!, kind, text, error);
    }
  }

  private deliveryFailed(
    from: string,
    to: string,
    kind: string,
    text: string,
    error: unknown,
  ) {
    if (this.disposed) return;
    // This also runs in detached promise handlers; failure to notify must not
    // turn an already retained child response into an unhandled rejection.
    try {
      const content = `Undelivered ${kind} from ${this.get(from).name} to ${this.get(to).name}: ${errorText(error)}\n${text}\nSource session: ${this.get(from).sessionFile}`;
      this.note(from, "delivery error", content);
      this.host.record({
        kind: "undelivered",
        from,
        to,
        messageKind: kind,
        text,
      });
      this.host.send(
        truncateHead(content, { maxBytes: 24000, maxLines: 600 }).content,
        {
          from,
          to: this.rootId,
          intendedRecipient: to,
          kind: "delivery error",
        },
        false,
      );
    } catch (notificationError) {
      console.error(
        "Subagent delivery notification failed:",
        errorText(notificationError),
      );
    }
  }

  private deliver(
    fromId: string,
    toId: string,
    kind: string,
    text: string,
    questionId?: string,
    triggerTurn = true,
  ) {
    if (this.disposed)
      throw new Error("The owning root session has shut down.");
    const from = this.get(fromId);
    const to = this.get(toId);
    if (to.activity === "closed")
      throw new Error(
        `Session ${toId} is closed. Its conversation is still stored in Pi.`,
      );
    const content = `[${kind} from ${from.name} (${from.id})${questionId ? `; question ${questionId}` : ""}]\n${text}`;
    const bounded = truncateHead(content, { maxBytes: 24000, maxLines: 600 });
    const delivered =
      bounded.content +
      (bounded.truncated
        ? `\n[Truncated. Full source session: ${from.sessionFile}]`
        : "");
    const details = { from: fromId, to: toId, kind, questionId };
    this.note(fromId, `sent → ${to.name}`, content);
    if (toId === this.rootId) {
      this.host.send(delivered, details, triggerTurn);
      this.note(toId, "received", delivered);
      return;
    }
    // Readiness covers SDK initialization only, never the active model response.
    void Promise.resolve(to.ready)
      .then(() => {
        if (this.disposed) return;
        if (!to.session || to.activity === "closed")
          throw new Error(`Session ${toId} is not available.`);
        return to.session.sendCustomMessage(
          {
            customType: MESSAGE_TYPE,
            content: delivered,
            display: true,
            details,
          },
          { triggerTurn, deliverAs: "steer" },
        );
      })
      .catch((error) => {
        this.deliveryFailed(fromId, toId, kind, text, error);
      });
  }

  private ask(fromId: string, text: string) {
    if (this.disposed)
      throw new Error("The owning root session has shut down.");
    const from = this.get(fromId);
    const question: Question = {
      id: randomUUID(),
      from: fromId,
      to: from.parentId ?? this.rootId,
      text,
    };
    this.questions.set(question.id, question);
    this.host.record({ kind: "question", ...question });
    this.note(fromId, "question pending", `${question.id}: ${text}`);
    if (fromId === this.rootId) {
      this.userQuestions.push(question.id);
      // Opening native UI is detached from tool completion; serialize dialogs, not agent work.
      setTimeout(() => {
        void this.promptUser();
      }, 0);
    } else this.deliver(fromId, question.to, "question", text, question.id);
    return {
      questionId: question.id,
      status: "pending",
      notice:
        "The answer will arrive asynchronously. Continue independent work or finish this turn.",
    };
  }

  private answer(
    owner: string,
    questionId: string,
    answer: string,
    user = false,
  ) {
    const question = this.questions.get(questionId);
    if (!question) throw new Error(`Unknown question ${questionId}.`);
    if (question.answer !== undefined)
      throw new Error("This question was already answered.");
    if (question.to !== owner || (question.from === this.rootId && !user))
      throw new Error(
        "Only the addressed parent (or the user at the root) can answer this question.",
      );
    this.deliver(owner, question.from, "answer", answer, questionId);
    question.answer = answer;
    this.host.record({ kind: "answer", questionId, answer });
    this.changed();
  }

  async promptUser(questionId?: string) {
    if (questionId) {
      const question = this.questions.get(questionId);
      if (
        !question ||
        question.from !== this.rootId ||
        question.answer !== undefined
      )
        throw new Error("No pending root question with that reference.");
      if (!this.userQuestions.includes(questionId))
        this.userQuestions.push(questionId);
    }
    if (this.askingUser || this.disposed) return;
    this.askingUser = true;
    try {
      while (this.userQuestions.length && !this.disposed) {
        const id = this.userQuestions.shift()!;
        const question = this.questions.get(id)!;
        const ctx = this.host.context();
        if (!ctx.hasUI) {
          this.host.send(
            `Question ${id} needs a user answer: ${question.text}. Resume in interactive Pi.`,
            { questionId: id },
            false,
          );
          continue;
        }
        this.userDialog = new AbortController();
        const answer = await ctx.ui.input(
          `Agent question · ${id}\n${question.text}`,
          "Your answer",
          { signal: this.userDialog.signal },
        );
        this.userDialog = undefined;
        if (this.disposed) return;
        if (answer?.trim()) this.answer(this.rootId, id, answer, true);
        else {
          this.note(
            this.rootId,
            "question pending",
            `Dismissed, not answered: ${id}. Use /agents answer ${id} when ready.`,
          );
          ctx.ui.notify(
            `Question remains pending. /agents answer ${id}`,
            "info",
          );
        }
      }
    } catch (error) {
      if (!this.disposed)
        this.host
          .context()
          .ui.notify(`Question UI failed: ${errorText(error)}`, "error");
    } finally {
      this.askingUser = false;
    }
  }

  async dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.userDialog?.abort();
    for (const child of this.agents.values()) {
      if (child.id === this.rootId) continue;
      if (child.activity === "working" || child.activity === "starting") {
        child.activity = "interrupted";
        child.manager?.appendCustomEntry(MESSAGE_TYPE, {
          kind: "interrupted",
          reason:
            "Root runtime shut down; use native Pi sessions to inspect or resume.",
        });
      }
    }
    await Promise.all(
      [...this.agents.values()].map(async (child) => {
        await child.ready;
        if (child.session) {
          child.session.clearQueue();
          await child.session.abort();
          await child.session.extensionRunner.emit({
            type: "session_shutdown",
            reason: "quit",
          });
          child.session.dispose();
          child.session = undefined;
        }
        child.cleanup?.();
      }),
    );
    this.changed();
  }
}
