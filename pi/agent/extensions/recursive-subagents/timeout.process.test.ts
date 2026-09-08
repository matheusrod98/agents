import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { createLocalBashOperations } from "@earendil-works/pi-coding-agent";
import { wrapChildBashOperations } from "./timeout.ts";

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

describe("wrapChildBashOperations process", () => {
  it(
    "kills a hung command and its child while preserving partial output",
    { timeout: 15_000 },
    async () => {
      const dir = await mkdtemp(join(tmpdir(), "child-timeout-"));
      const pidFile = join(dir, "child.pid");
      try {
        const wrapped = wrapChildBashOperations(createLocalBashOperations(), {
          confirmationMs: 2000,
        });
        const chunks: Buffer[] = [];
        const command = [
          "printf 'PARTIAL\\n'",
          `sleep 120 & echo $! > ${JSON.stringify(pidFile)}`,
          "wait",
          "printf 'AFTER\\n'",
        ].join("; ");
        await assert.rejects(
          wrapped.exec(command, dir, {
            onData: (data) => chunks.push(data),
            timeout: 1,
          }),
          (error: unknown) => {
            assert.ok(error instanceof Error);
            assert.match(error.message, /^timeout:1/);
            return true;
          },
        );
        const output = Buffer.concat(chunks).toString("utf8");
        assert.match(output, /PARTIAL/);
        assert.doesNotMatch(output, /AFTER/);
        const pid = Number((await readFile(pidFile, "utf8")).trim());
        assert.ok(Number.isInteger(pid) && pid > 0);
        assert.equal(pidAlive(pid), false);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
  );
});
