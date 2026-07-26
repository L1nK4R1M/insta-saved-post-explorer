import type { Pool, PoolClient } from "pg";

export type ClaimedJob = {
  id: string;
  ownerId: string;
  type: "places.metadata";
  postId: string;
  payload: unknown;
  attempt: number;
  maxAttempts: number;
  claimedBy: string;
  leaseExpiresAt: Date;
};

export type ClaimInput = {
  workerId: string;
  leaseDurationMs: number;
  maxAttempts: number;
  now?: Date;
};

export type LeaseIdentity = { id: string; claimedBy: string; now?: Date };
export type SafeFailure = { errorCode: string; errorMessage: string };

export interface JobRepository {
  claimOne(input: ClaimInput): Promise<ClaimedJob | null>;
  heartbeat(input: LeaseIdentity & { leaseDurationMs: number }): Promise<boolean>;
  succeed(input: LeaseIdentity & { result: unknown }): Promise<boolean>;
  retry(input: LeaseIdentity & SafeFailure & { nextAttemptAt: Date }): Promise<boolean>;
  fail(input: LeaseIdentity & SafeFailure): Promise<boolean>;
  ping(signal?: AbortSignal): Promise<void>;
  close(): Promise<void>;
}

type ClaimRow = {
  id: string;
  owner_id: string;
  post_id: string;
  source_theme: string;
  depth: string;
  analysis_version: string;
  attempt_count: number;
  max_attempts: number;
  lease_owner: string;
  lease_expires_at: Date;
};

const CLAIM_SQL = `
WITH candidate AS (
  SELECT id
  FROM place_analysis_jobs
  WHERE owner_id = $1
    AND attempt_count < LEAST(max_attempts, $5)
    AND (
      (status = 'PENDING' AND (next_attempt_at IS NULL OR next_attempt_at <= $2))
      OR (status = 'PROCESSING' AND lease_expires_at < $2)
    )
  ORDER BY priority DESC, created_at ASC, id ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1
)
UPDATE place_analysis_jobs AS job
SET status = 'PROCESSING',
    stage = 'EXTRACTING',
    lease_owner = $3,
    claimed_at = $2,
    lease_expires_at = $2 + ($4::bigint * interval '1 millisecond'),
    heartbeat_at = $2,
    attempt_count = job.attempt_count + 1,
    next_attempt_at = NULL,
    error_code = NULL,
    error_message = NULL,
    started_at = COALESCE(job.started_at, $2),
    updated_at = $2
FROM candidate
WHERE job.id = candidate.id AND job.owner_id = $1
RETURNING job.id, job.owner_id, job.post_id, job.source_theme, job.depth,
          job.analysis_version, job.attempt_count, job.max_attempts,
          job.lease_owner, job.lease_expires_at`;

export function createJobRepository(pool: Pool, options: { ownerId: string }): JobRepository {
  const ownerId = options.ownerId;

  return {
    async claimOne(input) {
      return inTransaction(pool, async (client) => {
        const now = input.now ?? new Date();
        await client.query(
          `UPDATE place_analysis_jobs
           SET status = 'FAILED', stage = 'COMPLETE',
               error_code = 'ATTEMPTS_EXHAUSTED',
               error_message = 'Worker attempts exhausted', completed_at = $2,
               lease_owner = NULL, lease_expires_at = NULL, heartbeat_at = NULL,
               updated_at = $2
           WHERE owner_id = $1 AND status = 'PROCESSING'
             AND lease_expires_at < $2
             AND attempt_count >= LEAST(max_attempts, $3)`,
          [ownerId, now, input.maxAttempts],
        );
        const result = await client.query<ClaimRow>(CLAIM_SQL, [
          ownerId,
          now,
          input.workerId,
          input.leaseDurationMs,
          input.maxAttempts,
        ]);
        const row = result.rows[0];
        if (!row) return null;
        return {
          id: row.id,
          ownerId: row.owner_id,
          type: "places.metadata",
          postId: row.post_id,
          payload: {
            sourceTheme: row.source_theme,
            depth: row.depth,
            analysisVersion: row.analysis_version,
          },
          attempt: row.attempt_count,
          maxAttempts: Math.min(row.max_attempts, input.maxAttempts),
          claimedBy: row.lease_owner,
          leaseExpiresAt: row.lease_expires_at,
        };
      });
    },

    async heartbeat(input) {
      const now = input.now ?? new Date();
      const result = await pool.query(
        `UPDATE place_analysis_jobs
         SET heartbeat_at = $4,
             lease_expires_at = $4 + ($5::bigint * interval '1 millisecond'),
             updated_at = $4
         WHERE owner_id = $1 AND id = $2 AND lease_owner = $3
           AND status = 'PROCESSING' AND lease_expires_at > $4`,
        [ownerId, input.id, input.claimedBy, now, input.leaseDurationMs],
      );
      return (result.rowCount ?? 0) === 1;
    },

    async succeed(input) {
      const now = input.now ?? new Date();
      const result = await pool.query(
        `UPDATE place_analysis_jobs
         SET status = 'SUCCEEDED', stage = 'COMPLETE', result = $5::jsonb,
             completed_at = $4, lease_owner = NULL, lease_expires_at = NULL,
             heartbeat_at = NULL, updated_at = $4
         WHERE owner_id = $1 AND id = $2 AND lease_owner = $3
           AND status = 'PROCESSING' AND lease_expires_at > $4`,
        [ownerId, input.id, input.claimedBy, now, JSON.stringify(input.result ?? null)],
      );
      return (result.rowCount ?? 0) === 1;
    },

    async retry(input) {
      const now = input.now ?? new Date();
      const failure = safeFailure(input);
      const result = await pool.query(
        `UPDATE place_analysis_jobs
         SET status = 'PENDING', stage = 'QUEUED', next_attempt_at = $5,
             error_code = $6, error_message = $7, lease_owner = NULL,
             lease_expires_at = NULL, heartbeat_at = NULL, updated_at = $4
         WHERE owner_id = $1 AND id = $2 AND lease_owner = $3
           AND status = 'PROCESSING' AND lease_expires_at > $4
           AND attempt_count < max_attempts`,
        [ownerId, input.id, input.claimedBy, now, input.nextAttemptAt, failure.errorCode, failure.errorMessage],
      );
      return (result.rowCount ?? 0) === 1;
    },

    async fail(input) {
      const now = input.now ?? new Date();
      const failure = safeFailure(input);
      const result = await pool.query(
        `UPDATE place_analysis_jobs
         SET status = 'FAILED', stage = 'COMPLETE', error_code = $5,
             error_message = $6, completed_at = $4, lease_owner = NULL,
             lease_expires_at = NULL, heartbeat_at = NULL, updated_at = $4
         WHERE owner_id = $1 AND id = $2 AND lease_owner = $3
           AND status = 'PROCESSING' AND lease_expires_at > $4`,
        [ownerId, input.id, input.claimedBy, now, failure.errorCode, failure.errorMessage],
      );
      return (result.rowCount ?? 0) === 1;
    },

    async ping(signal) {
      const query = pool.query("SELECT $1::text AS owner_id", [ownerId]).then(() => undefined);
      await withAbort(query, signal);
    },

    async close() {
      await pool.end();
    },
  };
}

async function withAbort<T>(operation: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return operation;
  if (signal.aborted) throw signal.reason ?? new Error("WORKER_DB_UNAVAILABLE");

  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason ?? new Error("WORKER_DB_UNAVAILABLE"));
    signal.addEventListener("abort", abort, { once: true });
    operation.then(
      (value) => {
        signal.removeEventListener("abort", abort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", abort);
        reject(error);
      },
    );
  });
}

async function inTransaction<T>(pool: Pool, operation: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function safeFailure(input: SafeFailure): SafeFailure {
  return {
    errorCode: input.errorCode.slice(0, 128),
    errorMessage: input.errorMessage.slice(0, 1_024),
  };
}
