import type { ClaimedJob, JobRepository } from "../db/jobs.js";
import type { WorkerLogger } from "../logger.js";
import { dispatchJob, type AuthorizedClients, type HandlerRegistry, RetryableWorkerError, TerminalWorkerError } from "./dispatcher.js";
import { startHeartbeat as startHeartbeatDefault, type HeartbeatController } from "./heartbeat.js";
import { retryDelayMs } from "./retry.js";
import type { ShutdownController } from "./shutdown.js";

type Workdirs = { create(jobId: string): Promise<string>; remove(workdir: string): Promise<void> };

export type RunResult = "idle" | "succeeded" | "retried" | "failed" | "lease_lost" | "stopping";

export function createWorkerRunner(input: {
  repository: JobRepository;
  registry: HandlerRegistry;
  workerId: string;
  maxAttempts: number;
  leaseDurationMs: number;
  heartbeatIntervalMs: number;
  shutdown: ShutdownController;
  workdirs: Workdirs;
  clients?: AuthorizedClients;
  createClients?: (job: ClaimedJob) => Promise<{ clients: AuthorizedClients; close(): Promise<void> }>;
  logger: WorkerLogger;
  now?: () => Date;
  startHeartbeat?: (input: Parameters<typeof startHeartbeatDefault>[0]) => HeartbeatController;
}) {
  const now = input.now ?? (() => new Date());
  const heartbeatFactory = input.startHeartbeat ?? startHeartbeatDefault;

  return {
    async runOnce(): Promise<RunResult> {
      if (input.shutdown.isStopping()) return "stopping";
      if (input.registry.size === 0) return "idle";

      const claimed = await input.repository.claimOne({
        workerId: input.workerId,
        leaseDurationMs: input.leaseDurationMs,
        maxAttempts: input.maxAttempts,
        now: now(),
      });
      if (!claimed) return "idle";
      return input.shutdown.track(executeClaimed(claimed));
    },
  };

  async function executeClaimed(job: ClaimedJob): Promise<RunResult> {
    const logger = input.logger.child({ jobId: job.id, ownerId: job.ownerId });
    const controller = new AbortController();
    const signal = AbortSignal.any([input.shutdown.signal, controller.signal]);
    let leaseLost = false;
    let workdir: string | undefined;
    let heartbeat: HeartbeatController | undefined;
    let clientScope: { clients: AuthorizedClients; close(): Promise<void> } | undefined;

    try {
      workdir = await input.workdirs.create(job.id);
      clientScope = input.createClients
        ? await input.createClients(job)
        : { clients: input.clients ?? {}, close: async () => undefined };
      heartbeat = heartbeatFactory({
        repository: input.repository,
        job,
        intervalMs: input.heartbeatIntervalMs,
        leaseDurationMs: input.leaseDurationMs,
        logger,
        now,
        onLeaseLost: () => {
          leaseLost = true;
          controller.abort(new Error("WORKER_LEASE_LOST"));
        },
      });

      const output = await dispatchJob(job, input.registry, { signal, workdir, clients: clientScope.clients, logger });
      if (leaseLost) return "lease_lost";
      const succeeded = await input.repository.succeed({
        id: job.id,
        claimedBy: job.claimedBy,
        result: output.result,
        now: now(),
      });
      return succeeded ? "succeeded" : "lease_lost";
    } catch (error) {
      if (leaseLost) return "lease_lost";
      if (input.shutdown.signal.aborted) return finalizeStopping(job);
      return finalizeFailure(job, error);
    } finally {
      try {
        await heartbeat?.stop();
      } catch {
        logger.error("worker_heartbeat_stop_failed");
      }
      try {
        await clientScope?.close();
      } catch {
        logger.error("worker_client_close_failed");
      }
      if (workdir) await input.workdirs.remove(workdir);
    }
  }

  async function finalizeFailure(job: ClaimedJob, error: unknown): Promise<RunResult> {
    const failure = classifyFailure(error);
    const timestamp = now();
    if (failure.retryable && job.attempt < job.maxAttempts) {
      const retried = await input.repository.retry({
        id: job.id,
        claimedBy: job.claimedBy,
        now: timestamp,
        nextAttemptAt: new Date(timestamp.getTime() + retryDelayMs(job.attempt)),
        errorCode: failure.code,
        errorMessage: failure.message,
      });
      return retried ? "retried" : "lease_lost";
    }

    const failed = await input.repository.fail({
      id: job.id,
      claimedBy: job.claimedBy,
      now: timestamp,
      errorCode: failure.retryable ? "ATTEMPTS_EXHAUSTED" : failure.code,
      errorMessage: failure.message,
    });
    return failed ? "failed" : "lease_lost";
  }

  async function finalizeStopping(job: ClaimedJob): Promise<RunResult> {
    const timestamp = now();
    try {
      const retried = await input.repository.retry({
        id: job.id,
        claimedBy: job.claimedBy,
        now: timestamp,
        nextAttemptAt: new Date(timestamp.getTime() + retryDelayMs(job.attempt)),
        errorCode: "WORKER_STOPPING",
        errorMessage: "Worker stopping",
      });
      return retried ? "retried" : "lease_lost";
    } catch {
      return "lease_lost";
    }
  }
}

function classifyFailure(error: unknown): { code: string; message: string; retryable: boolean } {
  if (error instanceof RetryableWorkerError || error instanceof TerminalWorkerError) {
    return { code: error.code, message: "Worker operation failed", retryable: error.retryable };
  }
  if (typeof error === "object" && error !== null && "retryable" in error && "code" in error) {
    return {
      code: String(error.code).slice(0, 128),
      message: "Handler failed",
      retryable: error.retryable === true,
    };
  }
  return { code: "WORKER_UNEXPECTED", message: "Unexpected worker failure", retryable: false };
}
