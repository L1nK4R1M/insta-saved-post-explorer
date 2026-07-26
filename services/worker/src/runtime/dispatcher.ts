import type { ClaimedJob } from "../db/jobs.js";
import type { WorkerLogger } from "../logger.js";

export type AuthorizedClients = Record<string, unknown>;

export type WorkerJobContext<TPayload> = {
  jobId: string;
  ownerId: string;
  postId: string;
  payload: TPayload;
  signal: AbortSignal;
  workdir: string;
  clients: AuthorizedClients;
  logger: WorkerLogger;
};

export type WorkerHandler<TPayload = unknown> = {
  type: ClaimedJob["type"];
  parsePayload(input: unknown): TPayload;
  run(context: WorkerJobContext<TPayload>): Promise<{ result: unknown }>;
};

export type HandlerRegistry = ReadonlyMap<ClaimedJob["type"], WorkerHandler>;

export class TerminalWorkerError extends Error {
  readonly retryable = false;

  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "TerminalWorkerError";
  }
}

export class RetryableWorkerError extends Error {
  readonly retryable = true;

  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "RetryableWorkerError";
  }
}

export function createRegistry(handlers: readonly WorkerHandler[]): HandlerRegistry {
  const registry = new Map<ClaimedJob["type"], WorkerHandler>();
  for (const handler of handlers) {
    if (registry.has(handler.type)) throw new Error("WORKER_HANDLER_DUPLICATE");
    registry.set(handler.type, handler);
  }
  return registry;
}

export function createProductionRegistry(): HandlerRegistry {
  return createRegistry([]);
}

export async function dispatchJob(
  job: ClaimedJob,
  registry: HandlerRegistry,
  input: { signal: AbortSignal; workdir: string; clients: AuthorizedClients; logger: WorkerLogger },
): Promise<{ result: unknown }> {
  const handler = registry.get(job.type);
  if (!handler) throw new TerminalWorkerError("WORKER_JOB_INVALID", "Unsupported worker job");

  let payload: unknown;
  try {
    payload = handler.parsePayload(job.payload);
  } catch {
    throw new TerminalWorkerError("WORKER_JOB_INVALID", "Invalid worker job payload");
  }

  return handler.run({
    jobId: job.id,
    ownerId: job.ownerId,
    postId: job.postId,
    payload,
    signal: input.signal,
    workdir: input.workdir,
    clients: input.clients,
    logger: input.logger,
  });
}
