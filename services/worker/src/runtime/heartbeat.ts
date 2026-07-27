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
  let timer: NodeJS.Timeout | undefined;
  let inFlight: Promise<void> | null = null;

  const loseLease = () => {
    if (lost) return;
    lost = true;
    input.logger.warn("worker_lease_lost", { jobId: input.job.id });
    input.onLeaseLost();
  };

  const schedule = () => {
    if (stopped || lost) return;
    timer = setTimeout(runHeartbeat, input.intervalMs);
    timer.unref();
  };

  const runHeartbeat = () => {
    timer = undefined;
    if (stopped || lost) return;
    inFlight = (async () => {
      try {
        const renewed = await input.repository.heartbeat({
          id: input.job.id,
          claimedBy: input.job.claimedBy,
          leaseDurationMs: input.leaseDurationMs,
          now: input.now?.(),
        });
        if (!renewed) loseLease();
      } catch {
        loseLease();
      } finally {
        inFlight = null;
        schedule();
      }
    })();
  };

  schedule();

  return {
    async stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      await inFlight;
    },
  };
}
