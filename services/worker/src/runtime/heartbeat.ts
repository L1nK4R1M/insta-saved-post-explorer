import type { ClaimedJob, JobRepository } from "../db/jobs.js";
import type { WorkerLogger } from "../logger.js";

export type HeartbeatController = { stop(): Promise<void> };

export function startHeartbeat(input: {
  repository: JobRepository;
  job: ClaimedJob;
  intervalMs: number;
  leaseDurationMs: number;
  onLeaseLost: () => void;
  logger: WorkerLogger;
  now?: () => Date;
}): HeartbeatController {
  let stopped = false;
  let lost = false;
  let inFlight: Promise<void> = Promise.resolve();

  const loseLease = () => {
    if (lost || stopped) return;
    lost = true;
    input.logger.warn("worker_lease_lost", { jobId: input.job.id });
    input.onLeaseLost();
  };

  const timer = setInterval(() => {
    if (stopped || lost) return;
    inFlight = input.repository
      .heartbeat({
        id: input.job.id,
        claimedBy: input.job.claimedBy,
        leaseDurationMs: input.leaseDurationMs,
        now: input.now?.(),
      })
      .then((renewed) => {
        if (!renewed) loseLease();
      })
      .catch(() => loseLease());
  }, input.intervalMs);
  timer.unref();

  return {
    async stop() {
      stopped = true;
      clearInterval(timer);
      await inFlight;
    },
  };
}
