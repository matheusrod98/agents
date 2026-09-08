import type { BashOperations } from "@earendil-works/pi-coding-agent";

export const DEFAULT_CHILD_BASH_TIMEOUT_SECONDS = 300;
export const CANCEL_CONFIRMATION_MS = 5000;
export const PARTIAL_OUTPUT_LIMIT = 4000;

export type CancellationStatus = "confirmed" | "unconfirmed";
export type IncidentTransition = "start" | "update" | "end";
export type Unavailable = { unavailable: true };

const UNAVAILABLE: Unavailable = { unavailable: true };

export interface Clock {
  now(): number;
  sleep(ms: number, signal?: AbortSignal): Promise<void>;
}

export interface FakeClock extends Clock {
  advance(ms: number): void;
}

export type ChildBashExecOptions = {
  onData: (data: Buffer) => void;
  signal?: AbortSignal;
  timeout?: number;
  env?: NodeJS.ProcessEnv;
};

export type TimeoutError = Error & { cancellation: CancellationStatus };

export type ChildBashTimeoutEvent = {
  command: string;
  cwd: string;
  timeoutSeconds: number;
  startedAt: number;
  deadline: number;
  elapsedMs: number;
  cancellation: CancellationStatus;
  partialOutput: string;
  error: TimeoutError;
};

export type WrapChildBashOperationsOptions = {
  clock?: Clock;
  confirmationMs?: number;
  onIncident?: (event: ChildBashTimeoutEvent) => void;
};

export type PriorAttempt = {
  incidentId: string;
  attempt: number;
  toolCallId: string;
  command: string;
  startedAt: number;
  deadline: number;
  cancellation: CancellationStatus;
};

export type TimeoutIncident = {
  incidentId: string;
  childId: string;
  attempt: number;
  toolCallId: string;
  task: string | Unavailable;
  command: string;
  args: unknown | Unavailable;
  cwd: string | Unavailable;
  startedAt: number;
  deadline: number;
  elapsedMs: number;
  timeoutSeconds: number;
  partialOutput: string | Unavailable;
  observedErrors: string[];
  cancellation: CancellationStatus;
  childActivity: string | Unavailable;
  artifacts: unknown | Unavailable;
  sessionFile: string | Unavailable;
  sourceSession: string | Unavailable;
  priorAttempts: PriorAttempt[];
  competingExecutionMayBeActive: boolean;
  inferredCause: Unavailable;
};

export type CreateIncidentInput = {
  childId: string;
  attempt: number;
  toolCallId: string;
  task?: string;
  command: string;
  args?: unknown;
  cwd?: string;
  startedAt: number;
  deadline: number;
  elapsedMs: number;
  timeoutSeconds?: number;
  partialOutput?: string;
  observedErrors?: string[];
  cancellation: CancellationStatus;
  childActivity?: string;
  artifacts?: unknown;
  sessionFile?: string;
  sourceSession?: string;
  priorAttempts?: PriorAttempt[];
};

type Waiter = {
  id: number;
  due: number;
  resolve: () => void;
  reject: (error: unknown) => void;
  abort?: () => void;
};

export function resolveChildBashTimeout(timeout: unknown): number {
  if (timeout === undefined) return DEFAULT_CHILD_BASH_TIMEOUT_SECONDS;
  if (typeof timeout !== "number" || !Number.isFinite(timeout) || timeout <= 0) {
    throw new Error(
      `Invalid child bash timeout: ${String(timeout)}. Must be a positive finite number of seconds.`,
    );
  }
  return timeout;
}

export const realClock: Clock = {
  now: () => Date.now(),
  sleep(ms, signal) {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(abortError());
        return;
      }
      const handle = setTimeout(resolve, Math.max(0, ms));
      const onAbort = () => {
        clearTimeout(handle);
        reject(abortError());
      };
      signal?.addEventListener("abort", onAbort, { once: true });
    });
  },
};

export function createFakeClock(startMs = 0): FakeClock {
  let now = startMs;
  let nextId = 1;
  const waiters: Waiter[] = [];

  const remove = (waiter: Waiter) => {
    const index = waiters.indexOf(waiter);
    if (index >= 0) waiters.splice(index, 1);
    waiter.abort?.();
  };

  return {
    now: () => now,
    sleep(ms, signal) {
      return new Promise((resolve, reject) => {
        if (signal?.aborted) {
          reject(abortError());
          return;
        }
        const waiter: Waiter = {
          id: nextId++,
          due: now + Math.max(0, ms),
          resolve: () => resolve(),
          reject,
        };
        const onAbort = () => {
          remove(waiter);
          reject(abortError());
        };
        signal?.addEventListener("abort", onAbort, { once: true });
        waiter.abort = () => signal?.removeEventListener("abort", onAbort);
        waiters.push(waiter);
      });
    },
    advance(ms) {
      const target = now + Math.max(0, ms);
      waiters.sort((a, b) => a.due - b.due || a.id - b.id);
      const due = waiters.filter((waiter) => waiter.due <= target);
      for (const waiter of due) remove(waiter);
      now = target;
      for (const waiter of due) waiter.resolve();
    },
  };
}

export function abortError(): Error {
  const error = new Error("aborted");
  error.name = "AbortError";
  return error;
}

export function isAbortError(error: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true;
  if (!error || typeof error !== "object") return false;
  const name = "name" in error ? String(error.name) : "";
  const message = "message" in error ? String(error.message) : "";
  return (
    name === "AbortError" ||
    message === "aborted" ||
    message === "AbortError" ||
    message === "Command aborted"
  );
}

export function isTimeoutError(error: unknown): error is TimeoutError {
  return error instanceof Error && error.message.startsWith("timeout:");
}

export function cancellationOf(error: unknown): CancellationStatus | undefined {
  if (!error || typeof error !== "object" || !("cancellation" in error))
    return undefined;
  const cancellation = (error as { cancellation: unknown }).cancellation;
  return cancellation === "confirmed" || cancellation === "unconfirmed"
    ? cancellation
    : undefined;
}

export function timeoutError(
  seconds: number,
  cancellation: CancellationStatus,
): TimeoutError {
  const error = new Error(`timeout:${seconds}`) as TimeoutError;
  error.cancellation = cancellation;
  return error;
}

export function redactSecrets(text: string): string {
  return text
    .replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]")
    .replace(/ghp_[A-Za-z0-9_]+/g, "ghp_[REDACTED]")
    .replace(/\b([A-Za-z0-9_]*TOKEN)=([^\s"'\\&;]+)/gi, "$1=[REDACTED]")
    .replace(
      /\b(password|passwd|secret|api[_-]?key|authorization|credential|access[_-]?key)=([^\s"'\\&;]+)/gi,
      "$1=[REDACTED]",
    );
}

function boundText(text: string): string {
  if (text.length <= PARTIAL_OUTPUT_LIMIT) return text;
  return `${text.slice(0, PARTIAL_OUTPUT_LIMIT)}\n[truncated]`;
}

function redactUnknown(value: unknown): unknown {
  if (value === undefined) return UNAVAILABLE;
  if (typeof value === "string") return redactSecrets(value);
  try {
    return JSON.parse(redactSecrets(JSON.stringify(value)));
  } catch {
    return redactSecrets(String(value));
  }
}

function priorSummary(incident: TimeoutIncident): PriorAttempt {
  return {
    incidentId: incident.incidentId,
    attempt: incident.attempt,
    toolCallId: incident.toolCallId,
    command: incident.command,
    startedAt: incident.startedAt,
    deadline: incident.deadline,
    cancellation: incident.cancellation,
  };
}

export function createIncident(input: CreateIncidentInput): TimeoutIncident {
  const timeoutSeconds =
    input.timeoutSeconds ??
    Math.max(0, (input.deadline - input.startedAt) / 1000);
  return {
    incidentId: `${input.childId}:${input.attempt}:${input.toolCallId}`,
    childId: input.childId,
    attempt: input.attempt,
    toolCallId: input.toolCallId,
    task: input.task ?? UNAVAILABLE,
    command: redactSecrets(input.command),
    args: input.args === undefined ? UNAVAILABLE : redactUnknown(input.args),
    cwd: input.cwd ?? UNAVAILABLE,
    startedAt: input.startedAt,
    deadline: input.deadline,
    elapsedMs: input.elapsedMs,
    timeoutSeconds,
    partialOutput:
      input.partialOutput === undefined
        ? UNAVAILABLE
        : boundText(redactSecrets(input.partialOutput)),
    observedErrors: (input.observedErrors ?? []).map(redactSecrets),
    cancellation: input.cancellation,
    childActivity: input.childActivity ?? UNAVAILABLE,
    artifacts: input.artifacts ?? UNAVAILABLE,
    sessionFile: input.sessionFile ?? UNAVAILABLE,
    sourceSession: input.sourceSession ?? UNAVAILABLE,
    priorAttempts: input.priorAttempts ?? [],
    competingExecutionMayBeActive: input.cancellation === "unconfirmed",
    inferredCause: UNAVAILABLE,
  };
}

export function formatTimeoutIncident(incident: TimeoutIncident): string {
  const field = (label: string, value: unknown) => {
    if (value && typeof value === "object" && "unavailable" in value)
      return `${label}: unavailable`;
    if (value === undefined) return `${label}: unavailable`;
    if (typeof value === "string") return `${label}: ${value}`;
    return `${label}: ${JSON.stringify(value)}`;
  };
  const observed =
    incident.observedErrors.length === 0
      ? "observed errors: none"
      : `observed errors:\n${incident.observedErrors.map((error) => `- ${error}`).join("\n")}`;
  const prior =
    incident.priorAttempts.length === 0
      ? "prior attempts: none"
      : `prior attempts:\n${incident.priorAttempts
          .map(
            (attempt) =>
              `- ${attempt.incidentId} cancellation=${attempt.cancellation} command=${attempt.command}`,
          )
          .join("\n")}`;
  return [
    `timeout:${incident.timeoutSeconds}`,
    field("incidentId", incident.incidentId),
    field("childId", incident.childId),
    field("attempt", incident.attempt),
    field("toolCallId", incident.toolCallId),
    field("task", incident.task),
    field("command", incident.command),
    field("args", incident.args),
    field("cwd", incident.cwd),
    field("startedAt", incident.startedAt),
    field("deadline", incident.deadline),
    field("elapsedMs", incident.elapsedMs),
    field("partialOutput", incident.partialOutput),
    observed,
    field("cancellation", incident.cancellation),
    field("childActivity", incident.childActivity),
    field("artifacts", incident.artifacts),
    field("sessionFile", incident.sessionFile),
    field("sourceSession", incident.sourceSession),
    prior,
    incident.competingExecutionMayBeActive
      ? "competing execution may still be active"
      : "competing execution: none reported",
    "inferred cause: unavailable",
  ].join("\n");
}

export class TimeoutSupervisor {
  private seen = new Set<string>();
  private latest = new Map<string, TimeoutIncident>();
  private byChild = new Map<string, TimeoutIncident[]>();

  recordStart(input: CreateIncidentInput): TimeoutIncident | undefined {
    return this.record("start", input);
  }

  recordUpdate(input: CreateIncidentInput): TimeoutIncident | undefined {
    return this.record("update", input);
  }

  recordEnd(input: CreateIncidentInput): TimeoutIncident | undefined {
    return this.record("end", input);
  }

  listPriorAttempts(childId: string, exceptIncidentId?: string): PriorAttempt[] {
    const incidents = this.byChild.get(childId) ?? [];
    const ids: string[] = [];
    const seenIds = new Set<string>();
    for (const incident of incidents) {
      if (incident.incidentId === exceptIncidentId) continue;
      if (seenIds.has(incident.incidentId)) continue;
      seenIds.add(incident.incidentId);
      ids.push(incident.incidentId);
    }
    return ids.flatMap((id) => {
      const incident = this.latest.get(id);
      return incident ? [priorSummary(incident)] : [];
    });
  }

  private record(
    transition: IncidentTransition,
    input: CreateIncidentInput,
  ): TimeoutIncident | undefined {
    const incidentId = `${input.childId}:${input.attempt}:${input.toolCallId}`;
    const key = `${incidentId}:${transition}:${input.cancellation}`;
    if (this.seen.has(key)) return undefined;
    this.seen.add(key);
    const incident = createIncident({
      ...input,
      priorAttempts:
        input.priorAttempts ??
        this.listPriorAttempts(input.childId, incidentId),
    });
    this.latest.set(incident.incidentId, incident);
    const list = this.byChild.get(incident.childId) ?? [];
    list.push(incident);
    this.byChild.set(incident.childId, list);
    return incident;
  }
}

export function wrapChildBashOperations(
  inner: BashOperations,
  options?: WrapChildBashOperationsOptions,
): BashOperations {
  const clock = options?.clock ?? realClock;
  const confirmationMs = options?.confirmationMs ?? CANCEL_CONFIRMATION_MS;

  return {
    exec: async (command, cwd, execOptions) => {
      if (execOptions.signal?.aborted) throw abortError();
      const timeoutSeconds = resolveChildBashTimeout(execOptions.timeout);
      const timeoutMs = timeoutSeconds * 1000;
      const startedAt = clock.now();
      const deadline = startedAt + timeoutMs;
      const chunks: Buffer[] = [];
      const onData = (data: Buffer) => {
        chunks.push(data);
        execOptions.onData(data);
      };

      let outcome:
        | { type: "ok"; value: { exitCode: number | null } }
        | { type: "err"; error: unknown }
        | undefined;

      const innerDone = inner
        .exec(command, cwd, {
          ...execOptions,
          onData,
          timeout: timeoutSeconds,
        })
        .then((value) => {
          outcome = { type: "ok", value };
          return value;
        })
        .catch((error: unknown) => {
          outcome = { type: "err", error };
          throw error;
        });

      const bound = clock.sleep(
        timeoutMs + confirmationMs,
        execOptions.signal,
      ).then(async () => {
        await Promise.resolve();
        if (outcome) return;
        throw timeoutError(timeoutSeconds, "unconfirmed");
      });

      const finishTimeout = (cancellation: CancellationStatus) => {
        const error = timeoutError(timeoutSeconds, cancellation);
        const partialOutput = boundText(
          redactSecrets(Buffer.concat(chunks).toString("utf8")),
        );
        options?.onIncident?.({
          command,
          cwd,
          timeoutSeconds,
          startedAt,
          deadline,
          elapsedMs: clock.now() - startedAt,
          cancellation,
          partialOutput,
          error,
        });
        throw error;
      };

      const classify = (error: unknown): never => {
        if (isAbortError(error, execOptions.signal)) throw abortError();
        if (isTimeoutError(error)) {
          const cancellation = cancellationOf(error) ?? "confirmed";
          return finishTimeout(cancellation);
        }
        throw error;
      };

      try {
        await Promise.race([innerDone, bound]);
      } catch (error) {
        if (outcome?.type === "ok") return outcome.value;
        if (outcome?.type === "err") return classify(outcome.error);
        return classify(error);
      }
      if (outcome?.type === "ok") return outcome.value;
      if (outcome?.type === "err") return classify(outcome.error);
      return finishTimeout("unconfirmed");
    },
  };
}
