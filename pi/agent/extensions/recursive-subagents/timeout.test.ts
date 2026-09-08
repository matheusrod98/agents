import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BashOperations } from "@earendil-works/pi-coding-agent";
import {
  CANCEL_CONFIRMATION_MS,
  createFakeClock,
  createIncident,
  DEFAULT_CHILD_BASH_TIMEOUT_SECONDS,
  formatTimeoutIncident,
  resolveChildBashTimeout,
  TimeoutSupervisor,
  wrapChildBashOperations,
  redactSecrets,
} from "./timeout.ts";

function recordingOperations(
  seen: { timeout?: number },
  impl?: BashOperations["exec"],
): BashOperations {
  return {
    exec: async (command, cwd, options) => {
      seen.timeout = options.timeout;
      if (impl) return impl(command, cwd, options);
      return { exitCode: 0 };
    },
  };
}

describe("resolveChildBashTimeout", () => {
  it("defaults omitted timeout to 300 seconds", () => {
    assert.equal(resolveChildBashTimeout(undefined), 300);
    assert.equal(
      resolveChildBashTimeout(undefined),
      DEFAULT_CHILD_BASH_TIMEOUT_SECONDS,
    );
  });

  it("accepts an explicit positive finite override", () => {
    assert.equal(resolveChildBashTimeout(1), 1);
    assert.equal(resolveChildBashTimeout(12.5), 12.5);
  });

  it("rejects invalid, non-positive, and non-finite limits", () => {
    for (const timeout of [0, -1, NaN, Infinity, -Infinity, "300", null, {}]) {
      assert.throws(() => resolveChildBashTimeout(timeout), /Invalid child bash timeout/);
    }
  });
});

describe("wrapChildBashOperations", () => {
  it("passes the omitted default timeout through to inner exec", async () => {
    const seen: { timeout?: number } = {};
    const wrapped = wrapChildBashOperations(recordingOperations(seen));
    const timeoutsBefore = process
      .getActiveResourcesInfo()
      .filter((name) => name === "Timeout").length;
    await wrapped.exec("true", "/tmp", { onData() {} });
    assert.equal(seen.timeout, DEFAULT_CHILD_BASH_TIMEOUT_SECONDS);
    const timeoutsAfter = process
      .getActiveResourcesInfo()
      .filter((name) => name === "Timeout").length;
    assert.equal(timeoutsAfter, timeoutsBefore);
  });

  it("passes an explicit timeout through to inner exec", async () => {
    const seen: { timeout?: number } = {};
    const wrapped = wrapChildBashOperations(recordingOperations(seen));
    await wrapped.exec("true", "/tmp", { onData() {}, timeout: 7 });
    assert.equal(seen.timeout, 7);
  });

  it("rejects invalid timeout before calling inner", async () => {
    let called = false;
    const wrapped = wrapChildBashOperations({
      exec: async () => {
        called = true;
        return { exitCode: 0 };
      },
    });
    await assert.rejects(
      wrapped.exec("true", "/tmp", { onData() {}, timeout: 0 }),
      /Invalid child bash timeout/,
    );
    assert.equal(called, false);
  });

  it("returns completion when inner finishes before the deadline", async () => {
    const clock = createFakeClock();
    const wrapped = wrapChildBashOperations(
      {
        exec: async (_command, _cwd, options) => {
          await clock.sleep((options.timeout ?? 0) * 500);
          return { exitCode: 0 };
        },
      },
      { clock, confirmationMs: CANCEL_CONFIRMATION_MS },
    );
    const pending = wrapped.exec("echo ok", "/tmp", { onData() {}, timeout: 2 });
    clock.advance(1000);
    assert.deepEqual(await pending, { exitCode: 0 });
  });

  it("prefers completion when inner settles at the confirmation bound", async () => {
    const clock = createFakeClock();
    const wrapped = wrapChildBashOperations(
      {
        exec: async (_command, _cwd, options) => {
          await clock.sleep(
            (options.timeout ?? 0) * 1000 + CANCEL_CONFIRMATION_MS,
          );
          return { exitCode: 0 };
        },
      },
      { clock, confirmationMs: CANCEL_CONFIRMATION_MS },
    );
    const pending = wrapped.exec("echo race", "/tmp", {
      onData() {},
      timeout: 1,
    });
    clock.advance(1000 + CANCEL_CONFIRMATION_MS);
    assert.deepEqual(await pending, { exitCode: 0 });
  });

  it("reports confirmed cancellation when inner throws timeout: after kill", async () => {
    const clock = createFakeClock();
    const incidents: string[] = [];
    const wrapped = wrapChildBashOperations(
      {
        exec: async (_command, _cwd, options) => {
          await clock.sleep((options.timeout ?? 0) * 1000);
          throw new Error(`timeout:${options.timeout}`);
        },
      },
      {
        clock,
        confirmationMs: CANCEL_CONFIRMATION_MS,
        onIncident: (event) => incidents.push(event.cancellation),
      },
    );
    const pending = wrapped.exec("sleep 30", "/tmp", { onData() {}, timeout: 1 });
    clock.advance(1000);
    await assert.rejects(pending, (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /^timeout:1/);
      assert.equal(
        (error as Error & { cancellation: string }).cancellation,
        "confirmed",
      );
      return true;
    });
    assert.deepEqual(incidents, ["confirmed"]);
  });

  it("reports unconfirmed cancellation when inner does not settle by the bound", async () => {
    const clock = createFakeClock();
    const incidents: Array<{ cancellation: string; message: string }> = [];
    let innerAborted = false;
    const wrapped = wrapChildBashOperations(
      {
        exec: (_command, _cwd, options) => {
          options.signal?.addEventListener("abort", () => {
            innerAborted = true;
          });
          return new Promise(() => {});
        },
      },
      {
        clock,
        confirmationMs: CANCEL_CONFIRMATION_MS,
        onIncident: (event) =>
          incidents.push({
            cancellation: event.cancellation,
            message: event.error.message,
          }),
      },
    );
    const pending = wrapped.exec("sleep 120", "/tmp", {
      onData() {},
      timeout: 1,
    });
    clock.advance(1000 + CANCEL_CONFIRMATION_MS);
    await assert.rejects(pending, (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /^timeout:1/);
      assert.equal(
        (error as Error & { cancellation: string }).cancellation,
        "unconfirmed",
      );
      return true;
    });
    assert.equal(incidents.length, 1);
    assert.equal(incidents[0]?.cancellation, "unconfirmed");
    assert.match(incidents[0]?.message ?? "", /^timeout:/);
    assert.equal(innerAborted, true);
  });

  it("does not treat abort as timeout", async () => {
    const clock = createFakeClock();
    const ac = new AbortController();
    const wrapped = wrapChildBashOperations(
      {
        exec: async (_command, _cwd, options) => {
          await clock.sleep(30_000, options.signal);
          return { exitCode: 0 };
        },
      },
      { clock, confirmationMs: CANCEL_CONFIRMATION_MS },
    );
    const pending = wrapped.exec("sleep 30", "/tmp", {
      onData() {},
      timeout: 30,
      signal: ac.signal,
    });
    ac.abort();
    await assert.rejects(pending, (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(error.message, "aborted");
      assert.equal(
        (error as Error & { cancellation?: string }).cancellation,
        undefined,
      );
      return true;
    });
  });

  it("forwards inner abort errors as abort, not timeout", async () => {
    const wrapped = wrapChildBashOperations({
      exec: async () => {
        throw new Error("aborted");
      },
    });
    await assert.rejects(
      wrapped.exec("true", "/tmp", { onData() {}, timeout: 1 }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(error.message, "aborted");
        return true;
      },
    );
  });
});

describe("redactSecrets", () => {
  it("redacts Bearer, ghp_, *_TOKEN=, and typical credentials", () => {
    const raw = [
      "Authorization: Bearer secret-token",
      "mirror ghp_liveTokenValue",
      "GITHUB_TOKEN=supersecret",
      "password=hunter2",
      "api_key=abcd",
      "safe=value",
    ].join("\n");
    const redacted = redactSecrets(raw);
    assert.match(redacted, /Bearer \[REDACTED\]/);
    assert.match(redacted, /ghp_\[REDACTED\]/);
    assert.match(redacted, /GITHUB_TOKEN=\[REDACTED\]/);
    assert.match(redacted, /password=\[REDACTED\]/);
    assert.match(redacted, /api_key=\[REDACTED\]/);
    assert.match(redacted, /safe=value/);
    assert.doesNotMatch(redacted, /supersecret|hunter2|liveTokenValue/);
  });
});

describe("incidents", () => {
  it("builds a stable id and marks unknown fields explicitly", () => {
    const incident = createIncident({
      childId: "child-1",
      attempt: 2,
      toolCallId: "tool-9",
      command: "curl -H 'Authorization: Bearer secret-token' https://example",
      startedAt: 1000,
      deadline: 301000,
      elapsedMs: 300000,
      cancellation: "unconfirmed",
      observedErrors: ["HTTP 500 from earlier request"],
    });
    assert.equal(incident.incidentId, "child-1:2:tool-9");
    assert.deepEqual(incident.task, { unavailable: true });
    assert.deepEqual(incident.cwd, { unavailable: true });
    assert.deepEqual(incident.childActivity, { unavailable: true });
    assert.deepEqual(incident.artifacts, { unavailable: true });
    assert.deepEqual(incident.sessionFile, { unavailable: true });
    assert.deepEqual(incident.sourceSession, { unavailable: true });
    assert.deepEqual(incident.args, { unavailable: true });
    assert.deepEqual(incident.inferredCause, { unavailable: true });
    assert.equal(incident.competingExecutionMayBeActive, true);
    assert.match(incident.command, /Bearer \[REDACTED\]/);
    assert.deepEqual(incident.observedErrors, ["HTTP 500 from earlier request"]);
  });

  it("formats incidents without inferred causes", () => {
    const incident = createIncident({
      childId: "child-1",
      attempt: 1,
      toolCallId: "call-1",
      task: "search github",
      command: "gh search repos GITHUB_TOKEN=abc",
      cwd: "/work",
      startedAt: 0,
      deadline: 300000,
      elapsedMs: 300000,
      partialOutput: "page 1",
      observedErrors: ["HTTP 500"],
      cancellation: "confirmed",
      childActivity: "working",
      sessionFile: "/tmp/session.jsonl",
      sourceSession: "child-1",
      priorAttempts: [
        {
          incidentId: "child-1:0:old",
          attempt: 0,
          toolCallId: "old",
          command: "gh search",
          startedAt: 0,
          deadline: 1,
          cancellation: "confirmed",
        },
      ],
    });
    const formatted = formatTimeoutIncident(incident);
    assert.match(formatted, /^timeout:300/);
    assert.match(formatted, /incidentId: child-1:1:call-1/);
    assert.match(formatted, /GITHUB_TOKEN=\[REDACTED\]/);
    assert.match(formatted, /observed errors:\n- HTTP 500/);
    assert.match(formatted, /inferred cause: unavailable/);
    assert.match(formatted, /prior attempts:\n- child-1:0:old/);
    assert.doesNotMatch(formatted, /caused by HTTP/i);
  });

  it("dedups the same supervisor transition", () => {
    const supervisor = new TimeoutSupervisor();
    const fields = {
      childId: "child-1",
      attempt: 1,
      toolCallId: "call-1",
      command: "sleep 1",
      startedAt: 0,
      deadline: 1000,
      elapsedMs: 1000,
      cancellation: "unconfirmed" as const,
    };
    const first = supervisor.recordStart(fields);
    const dup = supervisor.recordStart(fields);
    const update = supervisor.recordUpdate({
      ...fields,
      cancellation: "confirmed",
    });
    const dupUpdate = supervisor.recordUpdate({
      ...fields,
      cancellation: "confirmed",
    });
    assert.ok(first);
    assert.equal(dup, undefined);
    assert.ok(update);
    assert.equal(dupUpdate, undefined);
    const later = supervisor.recordStart({
      ...fields,
      attempt: 2,
      toolCallId: "call-2",
    });
    assert.ok(later);
    assert.equal(later.priorAttempts.length, 1);
    assert.equal(later.priorAttempts[0]?.incidentId, first.incidentId);
    assert.deepEqual(supervisor.listPriorAttempts("child-1", later.incidentId), [
      {
        incidentId: first.incidentId,
        attempt: 1,
        toolCallId: "call-1",
        command: "sleep 1",
        startedAt: 0,
        deadline: 1000,
        cancellation: "confirmed",
      },
    ]);
  });
});
