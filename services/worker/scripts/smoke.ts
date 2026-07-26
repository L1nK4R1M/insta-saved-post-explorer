import { randomUUID } from "node:crypto";
import { readdir } from "node:fs/promises";

import { parseWorkerConfig } from "../src/config.js";
import { createDatabasePool, withTransaction } from "../src/db/client.js";
import { createJobRepository } from "../src/db/jobs.js";
import { createSmokeRegistry } from "../src/handlers/noop-handler.js";
import { createLogger } from "../src/logger.js";
import { createWorkerRunner } from "../src/runtime/runner.js";
import { createShutdownController } from "../src/runtime/shutdown.js";
import { createTempWorkdirManager } from "../src/runtime/temp-workdir.js";

async function main(): Promise<void> {
  const config = parseWorkerConfig(process.env);
  assertEphemeral(config.databaseUrl, process.env);
  const pool = createDatabasePool(config.databaseUrl, config.workerId);
  const repository = createJobRepository(pool, { ownerId: config.ownerId });
  const postId = `smoke-post-${randomUUID()}`;
  const jobId = `smoke-job-${randomUUID()}`;
  const logger = createLogger({
    level: config.logLevel,
    secrets: [config.databaseUrl, config.r2.accessKeyId, config.r2.secretAccessKey],
  });
  const workdirs = createTempWorkdirManager({ root: config.tempRoot, maxAgeMs: config.janitorMaxAgeMs });

  try {
    await withTransaction(pool, async (client) => {
      await client.query(
        `INSERT INTO posts (id, owner_id, post_url, thumbnail_url, author_username, author_sort_key, caption, search_text, content_type, metadata, created_at, updated_at)
         VALUES ($1, $2, $3, 'https://example.test/smoke.jpg', 'smoke', 'smoke', '', 'smoke', 'OTHER', '{}', now(), now())`,
        [postId, config.ownerId, `https://instagram.test/p/${postId}`],
      );
      await client.query(
        `INSERT INTO place_analysis_jobs (
           id, owner_id, post_id, source_theme, depth, status, stage, priority,
           analysis_version, input_hash, attempt_count, max_attempts, created_at, updated_at
         ) VALUES ($1, $2, $3, 'smoke', 'METADATA_ONLY', 'PENDING', 'QUEUED', 0, 'phase-e-smoke', $4, 0, 1, now(), now())`,
        [jobId, config.ownerId, postId, randomUUID()],
      );
    });

    const runner = createWorkerRunner({
      repository,
      registry: createSmokeRegistry(),
      workerId: config.workerId,
      maxAttempts: config.maxAttempts,
      leaseDurationMs: config.leaseDurationMs,
      heartbeatIntervalMs: config.heartbeatIntervalMs,
      shutdown: createShutdownController({ timeoutMs: config.shutdownTimeoutMs }),
      workdirs,
      clients: {},
      logger,
    });
    const result = await runner.runOnce();
    if (result !== "succeeded") throw new Error(`Smoke job did not succeed: ${result}`);
    const persisted = await pool.query<{ status: string }>(
      "SELECT status FROM place_analysis_jobs WHERE owner_id = $1 AND id = $2",
      [config.ownerId, jobId],
    );
    if (persisted.rows[0]?.status !== "SUCCEEDED") throw new Error("Smoke status was not persisted");
    const remaining = await readdir(config.tempRoot);
    if (remaining.length !== 0) throw new Error("Smoke workdir cleanup failed");
    process.stdout.write("Phase E worker smoke passed\n");
  } finally {
    await pool.query("DELETE FROM posts WHERE owner_id = $1 AND id = $2", [config.ownerId, postId]).catch(() => undefined);
    await repository.close();
  }
}

function assertEphemeral(databaseUrl: string, env: NodeJS.ProcessEnv): void {
  if (env.NODE_ENV !== "test") throw new Error("Worker smoke requires NODE_ENV=test");
  const databaseName = new URL(databaseUrl).pathname.replace(/^\//, "");
  if (!databaseName.endsWith("_test") && env.WORKER_SMOKE_CONFIRM !== "EPHEMERAL") {
    throw new Error("Worker smoke requires an ephemeral database");
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Worker smoke failed"}\n`);
  process.exitCode = 1;
});
