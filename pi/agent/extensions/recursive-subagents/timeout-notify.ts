import {
  createBashToolDefinition,
  createLocalBashOperations,
  truncateHead,
} from "@earendil-works/pi-coding-agent";
import {
  formatTimeoutIncident,
  TimeoutSupervisor,
  wrapChildBashOperations,
  type ChildBashTimeoutEvent,
} from "./timeout.ts";

export const TIMEOUT_REPORT_KIND = "timeout";
export const MESSAGE_TYPE = "recursive-subagents";

export type TimeoutHistoryItem = {
  kind: string;
  text: string;
  time?: number;
};

export interface DeliveryAgent {
  id: string;
  parentId?: string;
  name: string;
  cwd: string;
  sessionFile?: string;
  activity: string;
  history: TimeoutHistoryItem[];
  session?: {
    sendCustomMessage: (
      message: {
        customType: string;
        content: string;
        display: boolean;
        details: Record<string, unknown>;
      },
      options: { triggerTurn: boolean; deliverAs: "steer" },
    ) => unknown;
  };
  ready?: Promise<void>;
}

export interface DeliveryContext {
  readonly disposed: boolean;
  readonly rootId: string;
  readonly host: {
    send(
      content: string,
      details: Record<string, unknown>,
      triggerTurn: boolean,
    ): void;
    record(data: unknown): void;
  };
  get(id: string): DeliveryAgent;
  note(id: string, kind: string, text: string): void;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function assignmentText(
  history: TimeoutHistoryItem[],
): string | undefined {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i]?.kind === "assignment") return history[i].text;
  }
}

export function childBashToolDefinition(
  cwd: string,
  onIncident: (event: ChildBashTimeoutEvent) => void,
) {
  return createBashToolDefinition(cwd, {
    operations: wrapChildBashOperations(createLocalBashOperations(), {
      onIncident,
    }),
  });
}

export function notifyChildTimeout(input: {
  supervisor: TimeoutSupervisor;
  child: Pick<DeliveryAgent, "id" | "activity" | "sessionFile" | "history">;
  event: ChildBashTimeoutEvent;
  toolCallId: string;
  attempt: number;
  args?: unknown;
  report: (kind: string, text: string) => void;
}): boolean {
  const incident = input.supervisor.recordEnd({
    childId: input.child.id,
    attempt: input.attempt,
    toolCallId: input.toolCallId,
    task: assignmentText(input.child.history),
    command: input.event.command,
    args: input.args,
    cwd: input.event.cwd,
    startedAt: input.event.startedAt,
    deadline: input.event.deadline,
    elapsedMs: input.event.elapsedMs,
    timeoutSeconds: input.event.timeoutSeconds,
    partialOutput: input.event.partialOutput,
    observedErrors: [input.event.error.message],
    cancellation: input.event.cancellation,
    childActivity: input.child.activity,
    artifacts: input.child.sessionFile
      ? {
          sessionFile: input.child.sessionFile,
          sourceSession: input.child.sessionFile,
        }
      : undefined,
    sessionFile: input.child.sessionFile,
    sourceSession: input.child.sessionFile,
  });
  if (!incident) return false;
  input.report(TIMEOUT_REPORT_KIND, formatTimeoutIncident(incident));
  return true;
}

export function reportChildEvent(
  tree: DeliveryContext,
  child: DeliveryAgent,
  kind: string,
  text: string,
) {
  if (tree.disposed) return;
  try {
    deliverChildEvent(tree, child.id, child.parentId!, kind, text);
  } catch (error) {
    notifyDeliveryFailed(tree, child.id, child.parentId!, kind, text, error);
  }
}

function notifyDeliveryFailed(
  tree: DeliveryContext,
  from: string,
  to: string,
  kind: string,
  text: string,
  error: unknown,
) {
  if (tree.disposed) return;
  // This also runs in detached promise handlers; failure to notify must not
  // turn an already retained child response into an unhandled rejection.
  try {
    const content = `Undelivered ${kind} from ${tree.get(from).name} to ${tree.get(to).name}: ${errorText(error)}\n${text}\nSource session: ${tree.get(from).sessionFile}`;
    tree.note(from, "delivery error", content);
    tree.host.record({
      kind: "undelivered",
      from,
      to,
      messageKind: kind,
      text,
    });
    tree.host.send(
      truncateHead(content, { maxBytes: 24000, maxLines: 600 }).content,
      {
        from,
        to: tree.rootId,
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

export function deliverChildEvent(
  tree: DeliveryContext,
  fromId: string,
  toId: string,
  kind: string,
  text: string,
  questionId?: string,
  triggerTurn = true,
) {
  if (tree.disposed)
    throw new Error("The owning root session has shut down.");
  const from = tree.get(fromId);
  const to = tree.get(toId);
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
  tree.note(fromId, `sent → ${to.name}`, content);
  if (toId === tree.rootId) {
    tree.host.send(delivered, details, triggerTurn);
    tree.note(toId, "received", delivered);
    return;
  }
  void Promise.resolve(to.ready)
    .then(() => {
      if (tree.disposed) return;
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
      notifyDeliveryFailed(tree, fromId, toId, kind, text, error);
    });
}
