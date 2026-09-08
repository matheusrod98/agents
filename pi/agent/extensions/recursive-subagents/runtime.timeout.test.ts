import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CANCEL_CONFIRMATION_MS,
  createFakeClock,
  TimeoutSupervisor,
  timeoutError,
  wrapChildBashOperations,
  type ChildBashTimeoutEvent,
} from "./timeout.ts";
import {
  childBashToolDefinition,
  notifyChildTimeout,
  reportChildEvent,
  type DeliveryAgent,
  type DeliveryContext,
} from "./timeout-notify.ts";

function timeoutEvent(
  overrides: Partial<ChildBashTimeoutEvent> = {},
): ChildBashTimeoutEvent {
  const timeoutSeconds = overrides.timeoutSeconds ?? 1;
  const startedAt = overrides.startedAt ?? 0;
  const deadline = overrides.deadline ?? startedAt + timeoutSeconds * 1000;
  const cancellation = overrides.cancellation ?? "confirmed";
  return {
    command: "gh search repos",
    cwd: "/work",
    timeoutSeconds,
    startedAt,
    deadline,
    elapsedMs: overrides.elapsedMs ?? deadline - startedAt,
    cancellation,
    partialOutput: "page 1",
    error: timeoutError(timeoutSeconds, cancellation),
    ...overrides,
  };
}

function fakeHost() {
  const sent: Array<{
    content: string;
    details: Record<string, unknown>;
    triggerTurn: boolean;
  }> = [];
  const recorded: unknown[] = [];
  return {
    sent,
    recorded,
    host: {
      send(
        content: string,
        details: Record<string, unknown>,
        triggerTurn: boolean,
      ) {
        sent.push({ content, details, triggerTurn });
      },
      record(data: unknown) {
        recorded.push(data);
      },
    },
  };
}

function delivery(
  agents: Map<string, DeliveryAgent>,
  host: ReturnType<typeof fakeHost>["host"],
  rootId = "root",
): DeliveryContext {
  return {
    get disposed() {
      return false;
    },
    rootId,
    host,
    get(id) {
      const row = agents.get(id);
      if (!row)
        throw new Error(
          `Unknown live session ${id}. Use subagent list for session references.`,
        );
      return row;
    },
    note() {},
  };
}

function childAgent(
  overrides: Partial<DeliveryAgent> = {},
): DeliveryAgent {
  return {
    id: "child-1",
    parentId: "root",
    name: "Researcher",
    cwd: "/work",
    sessionFile: "/tmp/child.jsonl",
    activity: "working",
    history: [
      { kind: "assignment", text: "search github without repeating stalls", time: 1 },
    ],
    ...overrides,
  };
}

function rootAgent(overrides: Partial<DeliveryAgent> = {}): DeliveryAgent {
  return {
    id: "root",
    name: "Main Pi",
    cwd: "/work",
    sessionFile: "/tmp/root.jsonl",
    activity: "working",
    history: [],
    ...overrides,
  };
}

describe("child bash tool", () => {
  it("keeps the bash name and explicit timeout override in the schema", () => {
    const tool = childBashToolDefinition("/work", () => {});
    assert.equal(tool.name, "bash");
    const properties = (
      tool.parameters as { properties?: Record<string, unknown> }
    ).properties;
    assert.ok(properties?.command);
    assert.ok(properties?.timeout);
    assert.match(JSON.stringify(properties?.timeout), /timeout/i);
  });
});

describe("notifyChildTimeout", () => {
  it("notifies the parent with kind timeout without waiting for agent_settled", () => {
    const reports: Array<{ kind: string; text: string }> = [];
    const child = childAgent();
    const notified = notifyChildTimeout({
      supervisor: new TimeoutSupervisor(),
      child,
      event: timeoutEvent(),
      toolCallId: "call-1",
      attempt: 1,
      report: (kind, text) => reports.push({ kind, text }),
    });
    assert.equal(notified, true);
    assert.equal(reports.length, 1);
    assert.equal(reports[0]?.kind, "timeout");
    assert.match(reports[0]?.text ?? "", /^timeout:1/);
    assert.match(reports[0]?.text ?? "", /search github without repeating stalls/);
    assert.match(reports[0]?.text ?? "", /incidentId: child-1:1:call-1/);
    assert.match(reports[0]?.text ?? "", /sessionFile: \/tmp\/child\.jsonl/);
    assert.equal(child.activity, "working");
  });

  it("dedups the same incident transition", () => {
    const reports: Array<{ kind: string; text: string }> = [];
    const supervisor = new TimeoutSupervisor();
    const input = {
      supervisor,
      child: childAgent(),
      event: timeoutEvent({ cancellation: "unconfirmed" }),
      toolCallId: "call-1",
      attempt: 1,
      report: (kind: string, text: string) => reports.push({ kind, text }),
    };
    assert.equal(notifyChildTimeout(input), true);
    assert.equal(notifyChildTimeout(input), false);
    assert.equal(reports.length, 1);
    assert.match(reports[0]?.text ?? "", /competing execution may still be active/);
  });

  it("does not report abort as timeout", async () => {
    const reports: Array<{ kind: string; text: string }> = [];
    const supervisor = new TimeoutSupervisor();
    const child = childAgent();
    const wrapped = wrapChildBashOperations(
      {
        exec: async () => {
          throw new Error("aborted");
        },
      },
      {
        onIncident: (event) => {
          notifyChildTimeout({
            supervisor,
            child,
            event,
            toolCallId: "call-abort",
            attempt: 1,
            report: (kind, text) => reports.push({ kind, text }),
          });
        },
      },
    );
    await assert.rejects(
      wrapped.exec("sleep 30", "/work", { onData() {}, timeout: 30 }),
      /aborted/,
    );
    assert.equal(reports.length, 0);
    assert.equal(child.activity, "working");
  });

  it("reports a wrapper timeout while the child stays live", async () => {
    const reports: Array<{ kind: string; text: string }> = [];
    const clock = createFakeClock();
    const supervisor = new TimeoutSupervisor();
    const child = childAgent();
    const wrapped = wrapChildBashOperations(
      { exec: () => new Promise(() => {}) },
      {
        clock,
        confirmationMs: CANCEL_CONFIRMATION_MS,
        onIncident: (event) => {
          notifyChildTimeout({
            supervisor,
            child,
            event,
            toolCallId: "call-hang",
            attempt: 2,
            report: (kind, text) => reports.push({ kind, text }),
          });
        },
      },
    );
    const pending = wrapped.exec("sleep 120", "/work", {
      onData() {},
      timeout: 1,
    });
    clock.advance(1000 + CANCEL_CONFIRMATION_MS);
    await assert.rejects(pending, /timeout:1/);
    assert.equal(reports.length, 1);
    assert.equal(reports[0]?.kind, "timeout");
    assert.match(reports[0]?.text ?? "", /cancellation: unconfirmed/);
    assert.equal(child.activity, "working");
  });
});

describe("timeout parent delivery", () => {
  it("queues a timeout to a busy root parent via host.send without settling", () => {
    const { host, sent } = fakeHost();
    const child = childAgent();
    const agents = new Map<string, DeliveryAgent>([
      ["root", rootAgent({ activity: "working" })],
      [child.id, child],
    ]);
    const ctx = delivery(agents, host);
    const reports: string[] = [];
    notifyChildTimeout({
      supervisor: new TimeoutSupervisor(),
      child,
      event: timeoutEvent(),
      toolCallId: "call-1",
      attempt: 1,
      report: (kind, text) => {
        reports.push(kind);
        reportChildEvent(ctx, child, kind, text);
      },
    });
    assert.deepEqual(reports, ["timeout"]);
    assert.equal(sent.length, 1);
    assert.equal(sent[0]?.triggerTurn, true);
    assert.equal(sent[0]?.details.kind, "timeout");
    assert.equal(sent[0]?.details.from, child.id);
    assert.equal(sent[0]?.details.to, "root");
    assert.match(sent[0]?.content ?? "", /timeout from Researcher/);
    assert.equal(child.activity, "working");
  });

  it("uses the deliveryFailed path when the parent is closed", () => {
    const { host, sent, recorded } = fakeHost();
    const parent = childAgent({
      id: "parent-1",
      parentId: "root",
      name: "Parent",
      activity: "closed",
      history: [],
    });
    const child = childAgent({
      id: "child-2",
      parentId: parent.id,
      name: "Nested",
    });
    const agents = new Map<string, DeliveryAgent>([
      ["root", rootAgent({ activity: "idle" })],
      [parent.id, parent],
      [child.id, child],
    ]);
    const ctx = delivery(agents, host);
    notifyChildTimeout({
      supervisor: new TimeoutSupervisor(),
      child,
      event: timeoutEvent({ cancellation: "unconfirmed" }),
      toolCallId: "call-9",
      attempt: 3,
      report: (kind, text) => reportChildEvent(ctx, child, kind, text),
    });
    assert.ok(
      recorded.some(
        (entry) =>
          entry &&
          typeof entry === "object" &&
          (entry as { kind?: string; messageKind?: string }).kind ===
            "undelivered" &&
          (entry as { messageKind?: string }).messageKind === "timeout",
      ),
    );
    assert.equal(sent.length, 1);
    assert.equal(sent[0]?.details.kind, "delivery error");
    assert.equal(sent[0]?.details.intendedRecipient, parent.id);
    assert.match(sent[0]?.content ?? "", /Undelivered timeout/);
    assert.equal(child.activity, "working");
  });

  it("does not abort the child session when delivering a timeout", () => {
    let aborted = 0;
    const { host, sent } = fakeHost();
    const child = childAgent({
      session: {
        sendCustomMessage: async () => {},
        abort: async () => {
          aborted += 1;
        },
      } as DeliveryAgent["session"],
    });
    const agents = new Map<string, DeliveryAgent>([
      ["root", rootAgent({ activity: "idle" })],
      [child.id, child],
    ]);
    reportChildEvent(
      delivery(agents, host),
      child,
      "timeout",
      "timeout:1\nincidentId: child-1:1:call-1",
    );
    assert.equal(aborted, 0);
    assert.equal(sent.length, 1);
    assert.equal(child.activity, "working");
  });
});
