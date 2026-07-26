import { pathToFileURL } from "node:url";

import { parseWorkerConfig } from "./config.js";
import { createDatabasePool } from "./db/client.js";
import { createJobRepository } from "./db/jobs.js";
import { createHealthServer } from "./health/server.js";
import { createLogger } from "./logger.js";
import { createProductionRegistry } from "./runtime/dispatcher.js";
import { createWorkerRunner } from "./runtime/runner.js";
import { createShutdownController } from "./runtime/shutdown.js";
import { createTempWorkdirManager } from "./runtime/temp-workdir.js";

export async function startWorker(env: NodeJS.ProcessEnv = process.env): Promise<{ stop(): Promise<boolean> }> {
  const config = parseWorkerConfig(env);
  const logger = createLogger({
    level: config.logLevel,
    secrets: [config.databaseUrl, config.r2.accessKeyId, config.r2.secretAccessKey],
  }).child({ workerId: config.workerId, ownerId: config.ownerId });
  const pool = createDatabasePool(config.databaseUrl, config.workerId);
  const repository = createJobRepository(pool, { ownerId: config.ownerId });
  const shutdown = createShutdownController({ timeoutMs: config.shutdownTimeoutMs });
  const workdirs = createTempWorkdirManager({ root: config.tempRoot, maxAgeMs: config.janitorMaxAgeMs });
  const registry = createProductionRegistry();
  const runner = createWorkerRunner({
    repository,
    registry,
    workerId: config.workerId,
    maxAttempts: config.maxAttempts,
    leaseDurationMs: config.leaseDurationMs,
    heartbeatIntervalMs: config.heartbeatIntervalMs,
    shutdown,
    workdirs,
    clients: {},
    logger,
  });
  const health = createHealthServer({
    host: config.healthHost,
    port: config.healthPort,
    isStopping: shutdown.isStopping,
    checkDatabase: (signal) => repository.ping(signal),
  });
  let pollTimer: NodeJS.Timeout | undefined;
  let janitorTimer: NodeJS.Timeout | undefined;
  let stopped: Promise<boolean> | null = null;

  const poll = async () => {
    if (shutdown.isStopping()) return;
    try {
      await runner.runOnce();
    } catch {
      logger.error("worker_poll_failed");
    }
    if (!shutdown.isStopping()) {
      pollTimer = setTimeout(poll, config.pollIntervalMs);
      pollTimer.unref();
    }
  };

  const stop = () => {
    if (stopped) return stopped;
    stopped = (async () => {
      const graceful = await shutdown.stop();
      if (pollTimer) clearTimeout(pollTimer);
      if (janitorTimer) clearInterval(janitorTimer);
      await health.close();
      await repository.close();
      logger.info("worker_stopped", { graceful });
      return graceful;
    })();
    return stopped;
  };

  const onSignal = () => {
    void stop().then((graceful) => {
      if (!graceful) process.exitCode = 1;
    });
  };
  process.once("SIGTERM", onSignal);
  process.once("SIGINT", onSignal);

  try {
    await workdirs.cleanupStale();
    await health.start();
    janitorTimer = setInterval(() => {
      void workdirs.cleanupStale().catch(() => logger.error("worker_janitor_failed"));
    }, Math.min(config.janitorMaxAgeMs, 3_600_000));
    janitorTimer.unref();
    if (registry.size > 0) void poll();
    logger.info("worker_started", { handlers: registry.size });
  } catch (error) {
    process.removeListener("SIGTERM", onSignal);
    process.removeListener("SIGINT", onSignal);
    await stop();
    throw error;
  }

  return {
    async stop() {
      process.removeListener("SIGTERM", onSignal);
      process.removeListener("SIGINT", onSignal);
      return stop();
    },
  };
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === invokedPath) {
  startWorker().catch(() => {
    process.stderr.write("Worker startup failed\n");
    process.exitCode = 1;
  });
}
