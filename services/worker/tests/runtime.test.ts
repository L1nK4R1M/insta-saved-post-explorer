import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import type { ClaimedJob, JobRepository } from "../src/db/jobs.js";
import { createProductionRegistry, createRegistry, dispatchJob, TerminalWorkerError, type WorkerHandler } from "../src/runtime/dispatcher.js";
import { startHeartbeat } from "../src/runtime/heartbeat.js";
import { createWorkerRunner } from "../src/runtime/runner.js";
import { createShutdownController } from "../src/runtime/shutdown.js";

const job = (override: Partial<ClaimedJob> = {}): ClaimedJob => ({
  id: "job-1",
  ownerId: "owner-1",
  type: "places.metadata",
  postId: "post-1",
  payload: { sourceTheme: "travel" },
  attempt: 1,
  maxAttempts: 3,
  claimedBy: "worker-1",
  leaseExpiresAt: new Date(Date.now() + 90_000),
  ...override,
});

const handler = (
  run: WorkerHandler<{ sourceTheme: string }>["run"] = vi.fn(async () => ({ result: { ok: true } })),
): WorkerHandler<{ sourceTheme: string }> => ({
  type: "places.metadata" as const,
  parsePayload: (input: unknown) => z.object({ sourceTheme: z.string().min(1) }).parse(input),
  run,
});

afterEach(() => vi.useRealTimers());

describe("dispatcher", () => {
  it("keeps the production registry empty in Phase E", () => {
    expect(createProductionRegistry().size).toBe(0);
  });

  it("rejects unsupported types and invalid payloads before execution", async () => {
    const run = vi.fn();
    const registry = createRegistry([handler(run)]);

    await expect(dispatchJob(job({ type: "unknown" as ClaimedJob["type"] }), registry, context())).rejects.toMatchObject({ code: "WORKER_JOB_INVALID" });
    await expect(dispatchJob(job({ payload: {} }), registry, context())).rejects.toMatchObject({ code: "WORKER_JOB_INVALID" });
    expect(run).not.toHaveBeenCalled();
  });

  it("runs a registered handler with parsed payload and bounded context", async () => {
    const run = vi.fn(async () => ({ result: { ok: true } }));
    const registry = createRegistry([handler(run)]);

    await expect(dispatchJob(job(), registry, context())).resolves.toEqual({ result: { ok: true } });
    expect(run).toHaveBeenCalledWith(expect.objectContaining({ jobId: "job-1", ownerId: "owner-1", postId: "post-1", payload: { sourceTheme: "travel" } }));
  });
});

describe("worker runner", () => {
  it("renews the lease and reports an authoritative heartbeat loss", async () => {
    vi.useFakeTimers();
    const repository = fakeRepository();
    const onLeaseLost = vi.fn();
    const heartbeat = startHeartbeat({
      repository,
      job: job(),
      intervalMs: 100,
      leaseDurationMs: 900,
      onLeaseLost,
      logger: context().logger,
      now: () => new Date("2026-07-26T10:00:00.000Z"),
    });

    await vi.advanceTimersByTimeAsync(100);
    expect(repository.heartbeat).toHaveBeenCalledOnce();
    repository.heartbeat.mockResolvedValue(false);
    await vi.advanceTimersByTimeAsync(100);
    expect(onLeaseLost).toHaveBeenCalledOnce();
    await heartbeat.stop();
  });

  it("does not claim when production has no registered handler", async () => {
    const repository = fakeRepository();
    const runner = createWorkerRunner(baseRunnerInput(repository, createProductionRegistry()));

    await expect(runner.runOnce()).resolves.toBe("idle");
    expect(repository.claimOne).not.toHaveBeenCalled();
  });

  it("aborts locally and refuses finalization after heartbeat loss", async () => {
    const repository = fakeRepository();
    repository.claimOne.mockResolvedValue(job());
    const run = vi.fn(async ({ signal }: { signal: AbortSignal }) => {
      await new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve(), { once: true }));
      throw new Error("aborted");
    });
    const runner = createWorkerRunner({
      ...baseRunnerInput(repository, createRegistry([handler(run)])),
      startHeartbeat: (input) => {
        queueMicrotask(input.onLeaseLost);
        return { stop: vi.fn(async () => undefined) };
      },
    });

    await expect(runner.runOnce()).resolves.toBe("lease_lost");
    expect(repository.succeed).not.toHaveBeenCalled();
    expect(repository.retry).not.toHaveBeenCalled();
    expect(repository.fail).not.toHaveBeenCalled();
  });

  it("treats a false success guard as a lost lease", async () => {
    const repository = fakeRepository();
    repository.claimOne.mockResolvedValue(job());
    repository.succeed.mockResolvedValue(false);
    const runner = createWorkerRunner(baseRunnerInput(repository, createRegistry([handler()])));

    await expect(runner.runOnce()).resolves.toBe("lease_lost");
  });

  it("retries transient errors and fails terminal or exhausted jobs", async () => {
    const retryRepository = fakeRepository();
    retryRepository.claimOne.mockResolvedValue(job());
    const retryHandler = handler(vi.fn(async () => { throw Object.assign(new Error("temporary"), { code: "TEMP", retryable: true }); }));
    await expect(createWorkerRunner(baseRunnerInput(retryRepository, createRegistry([retryHandler]))).runOnce()).resolves.toBe("retried");
    expect(retryRepository.retry).toHaveBeenCalledWith(expect.objectContaining({ errorCode: "TEMP" }));

    for (const [failure, claimed] of [
      [new TerminalWorkerError("INVALID", "invalid"), job()],
      [Object.assign(new Error("temporary"), { code: "TEMP", retryable: true }), job({ attempt: 3, maxAttempts: 3 })],
    ] as const) {
      const repository = fakeRepository();
      repository.claimOne.mockResolvedValue(claimed);
      const failingHandler = handler(vi.fn(async () => { throw failure; }));
      await expect(createWorkerRunner(baseRunnerInput(repository, createRegistry([failingHandler]))).runOnce()).resolves.toBe("failed");
      expect(repository.fail).toHaveBeenCalledOnce();
    }
  });

  it("never claims after shutdown begins", async () => {
    const repository = fakeRepository();
    const shutdown = createShutdownController({ timeoutMs: 1_000 });
    const runner = createWorkerRunner({ ...baseRunnerInput(repository, createRegistry([handler()])), shutdown });
    const stopPromise = shutdown.stop();

    await expect(runner.runOnce()).resolves.toBe("stopping");
    await expect(stopPromise).resolves.toBe(true);
    expect(repository.claimOne).not.toHaveBeenCalled();
  });
});

function context() {
  return {
    signal: new AbortController().signal,
    workdir: "C:/tmp/job",
    clients: {},
    logger: { child: () => context().logger, debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  };
}

function fakeRepository() {
  return {
    claimOne: vi.fn<JobRepository["claimOne"]>(async () => null),
    heartbeat: vi.fn<JobRepository["heartbeat"]>(async () => true),
    succeed: vi.fn<JobRepository["succeed"]>(async () => true),
    retry: vi.fn<JobRepository["retry"]>(async () => true),
    fail: vi.fn<JobRepository["fail"]>(async () => true),
    ping: vi.fn<JobRepository["ping"]>(async () => undefined),
    close: vi.fn<JobRepository["close"]>(async () => undefined),
  };
}

function baseRunnerInput(repository: ReturnType<typeof fakeRepository>, registry: ReturnType<typeof createRegistry>) {
  const logger = context().logger;
  return {
    repository,
    registry,
    workerId: "worker-1",
    maxAttempts: 3,
    leaseDurationMs: 90_000,
    heartbeatIntervalMs: 30_000,
    shutdown: createShutdownController({ timeoutMs: 1_000 }),
    workdirs: {
      create: vi.fn(async () => "C:/tmp/job"),
      remove: vi.fn(async () => undefined),
    },
    clients: {},
    logger,
    now: () => new Date("2026-07-26T10:00:00.000Z"),
  };
}
