import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("Sequential Render Mutex (FIFO execution guarantee)", () => {
  it("should process concurrent calls for the same runId in strict sequential order", async () => {
    const runRenderLocks = new Map<string, Promise<any>>();
    const executionLog: string[] = [];

    async function simulateRender(runId: string, version: string, delayMs: number) {
      const previousPromise = runRenderLocks.get(runId) || Promise.resolve();

      const currentPromise = (async () => {
        try {
          await previousPromise.catch(() => {});
        } catch {}

        executionLog.push(`start_${version}`);
        await new Promise((r) => setTimeout(r, delayMs));
        executionLog.push(`finish_${version}`);
        return `result_${version}`;
      })();

      runRenderLocks.set(runId, currentPromise);

      const result = await currentPromise;
      if (runRenderLocks.get(runId) === currentPromise) {
        runRenderLocks.delete(runId);
      }
      return result;
    }

    // Launch 3 concurrent requests simultaneously:
    // Request 1: delay 60ms
    // Request 2: delay 20ms
    // Request 3: delay 10ms
    const p1 = simulateRender("run-123", "v1", 60);
    const p2 = simulateRender("run-123", "v2", 20);
    const p3 = simulateRender("run-123", "v3", 10);

    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);

    assert.equal(r1, "result_v1");
    assert.equal(r2, "result_v2");
    assert.equal(r3, "result_v3");

    // Must be strictly sequential: start_v1 -> finish_v1 -> start_v2 -> finish_v2 -> start_v3 -> finish_v3
    assert.deepEqual(executionLog, [
      "start_v1",
      "finish_v1",
      "start_v2",
      "finish_v2",
      "start_v3",
      "finish_v3",
    ], "Render jobs must execute sequentially in strict FIFO order without overlapping");

    // Lock must be cleared after completion
    assert.equal(runRenderLocks.has("run-123"), false, "Mutex lock map should be clean after all tasks finish");
  });

  it("should not block subsequent tasks if an earlier task fails with error", async () => {
    const runRenderLocks = new Map<string, Promise<any>>();
    const executionLog: string[] = [];

    async function simulateRender(runId: string, version: string, shouldFail: boolean) {
      const previousPromise = runRenderLocks.get(runId) || Promise.resolve();

      const currentPromise = (async () => {
        try {
          await previousPromise.catch(() => {});
        } catch {}

        executionLog.push(`start_${version}`);
        if (shouldFail) {
          throw new Error(`error in ${version}`);
        }
        executionLog.push(`finish_${version}`);
        return `ok_${version}`;
      })();

      runRenderLocks.set(runId, currentPromise);

      try {
        const result = await currentPromise;
        if (runRenderLocks.get(runId) === currentPromise) {
          runRenderLocks.delete(runId);
        }
        return result;
      } catch (err) {
        if (runRenderLocks.get(runId) === currentPromise) {
          runRenderLocks.delete(runId);
        }
        throw err;
      }
    }

    const p1 = simulateRender("run-fail", "job1", true);
    const p2 = simulateRender("run-fail", "job2", false);

    await assert.rejects(p1, /error in job1/);
    const r2 = await p2;

    assert.equal(r2, "ok_job2", "Second task must succeed even if first task failed");
    assert.deepEqual(executionLog, ["start_job1", "start_job2", "finish_job2"]);
    assert.equal(runRenderLocks.has("run-fail"), false);
  });
});
