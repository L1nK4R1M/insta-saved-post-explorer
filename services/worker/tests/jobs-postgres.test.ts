import { randomUUID } from "node:crypto";

import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createJobRepository } from "../src/db/jobs.js";
import { retryDelayMs } from "../src/runtime/retry.js";

const databaseUrl = process.env.TEST_DATABASE_URL?.trim() ?? "";
const describeWithDatabase = databaseUrl ? describe : describe.skip;
const OWNER_A = "owner-worker-a";
const OWNER_B = "owner-worker-b";

let pool: Pool;

describeWithDatabase("PostgreSQL job repository", () => {
  beforeAll(() => {
    pool = new Pool({ connectionString: databaseUrl, max: 6 });
  });

  afterAll(async () => {
    await resetFixtures();
    await pool.end();
  });

  beforeEach(async () => {
    await resetFixtures();
    await seedPost(OWNER_A, "post-worker-a");
    await seedPost(OWNER_B, "post-worker-b");
  });

  it("allows exactly one winner across simultaneous claims", async () => {
    await seedJob(OWNER_A, "job-one", "post-worker-a");
    const repository = createJobRepository(pool, { ownerId: OWNER_A });
    const now = new Date("2026-07-26T10:00:00.000Z");

    const claims = await Promise.all([
      repository.claimOne({ workerId: "worker-1", leaseDurationMs: 90_000, maxAttempts: 3, now }),
      repository.claimOne({ workerId: "worker-2", leaseDurationMs: 90_000, maxAttempts: 3, now }),
    ]);

    expect(claims.filter(Boolean)).toHaveLength(1);
    expect(claims.find(Boolean)).toMatchObject({ id: "job-one", ownerId: OWNER_A, attempt: 1 });
  });

  it("skips future retries and live leases, then reclaims an expired lease", async () => {
    const now = new Date("2026-07-26T10:00:00.000Z");
    await seedJob(OWNER_A, "future", "post-worker-a", {
      nextAttemptAt: new Date(now.getTime() + 60_000),
    });
    await seedJob(OWNER_A, "live", "post-worker-a", {
      status: "PROCESSING",
      leaseOwner: "other",
      leaseExpiresAt: new Date(now.getTime() + 60_000),
      inputHash: randomUUID(),
    });
    await seedJob(OWNER_A, "expired", "post-worker-a", {
      status: "PROCESSING",
      leaseOwner: "dead-worker",
      leaseExpiresAt: new Date(now.getTime() - 1),
      inputHash: randomUUID(),
      priority: 10,
    });
    const repository = createJobRepository(pool, { ownerId: OWNER_A });

    await expect(
      repository.claimOne({ workerId: "replacement", leaseDurationMs: 90_000, maxAttempts: 3, now }),
    ).resolves.toMatchObject({ id: "expired", claimedBy: "replacement", attempt: 1 });
  });

  it("keeps other owners invisible and guards heartbeat and finalization by claimant", async () => {
    await seedJob(OWNER_B, "job-owner-b", "post-worker-b");
    await seedJob(OWNER_A, "job-owner-a", "post-worker-a");
    const now = new Date("2026-07-26T10:00:00.000Z");
    const repository = createJobRepository(pool, { ownerId: OWNER_A });
    const claimed = await repository.claimOne({ workerId: "worker-1", leaseDurationMs: 90_000, maxAttempts: 3, now });

    expect(claimed?.id).toBe("job-owner-a");
    await expect(repository.heartbeat({ id: claimed!.id, claimedBy: "wrong", now, leaseDurationMs: 90_000 })).resolves.toBe(false);
    await expect(repository.succeed({ id: claimed!.id, claimedBy: "wrong", now, result: {} })).resolves.toBe(false);
    await expect(repository.succeed({ id: claimed!.id, claimedBy: "worker-1", now, result: { ok: true } })).resolves.toBe(true);

    const ownerB = await pool.query<{ status: string }>(
      "SELECT status FROM place_analysis_jobs WHERE owner_id = $1 AND id = $2",
      [OWNER_B, "job-owner-b"],
    );
    expect(ownerB.rows[0]?.status).toBe("PENDING");
  });

  it("schedules bounded retries and makes exhausted attempts terminal", async () => {
    const now = new Date("2026-07-26T10:00:00.000Z");
    await seedJob(OWNER_A, "retryable", "post-worker-a", { maxAttempts: 2 });
    const repository = createJobRepository(pool, { ownerId: OWNER_A });
    const first = await repository.claimOne({ workerId: "worker-1", leaseDurationMs: 90_000, maxAttempts: 3, now });
    const retryAt = new Date(now.getTime() + retryDelayMs(first!.attempt));

    await expect(repository.retry({ id: first!.id, claimedBy: "worker-1", now, nextAttemptAt: retryAt, errorCode: "TRANSIENT", errorMessage: "safe" })).resolves.toBe(true);
    await expect(repository.claimOne({ workerId: "worker-2", leaseDurationMs: 90_000, maxAttempts: 3, now })).resolves.toBeNull();
    const second = await repository.claimOne({ workerId: "worker-2", leaseDurationMs: 90_000, maxAttempts: 3, now: retryAt });
    expect(second?.attempt).toBe(2);
    await expect(repository.retry({ id: second!.id, claimedBy: "worker-2", now: retryAt, nextAttemptAt: new Date(retryAt.getTime() + 1_000), errorCode: "TRANSIENT", errorMessage: "safe" })).resolves.toBe(false);
    await expect(repository.fail({ id: second!.id, claimedBy: "worker-2", now: retryAt, errorCode: "ATTEMPTS_EXHAUSTED", errorMessage: "safe" })).resolves.toBe(true);
  });
});

describe("retryDelayMs", () => {
  it.each([
    [1, 1_000],
    [2, 2_000],
    [10, 300_000],
    [100, 300_000],
  ])("caps attempt %i at %i ms", (attempt, expected) => {
    expect(retryDelayMs(attempt)).toBe(expected);
  });
});

async function resetFixtures(): Promise<void> {
  if (!pool) return;
  await pool.query("DELETE FROM posts WHERE owner_id = ANY($1::text[])", [[OWNER_A, OWNER_B]]);
}

async function seedPost(ownerId: string, id: string): Promise<void> {
  await pool.query(
    `INSERT INTO posts (id, owner_id, post_url, thumbnail_url, author_username, author_sort_key, caption, search_text, content_type, metadata, created_at, updated_at)
     VALUES ($1, $2, $3, 'https://example.test/thumbnail.jpg', 'worker', 'worker', '', 'worker', 'OTHER', '{}', now(), now())`,
    [id, ownerId, `https://instagram.test/p/${id}`],
  );
}

type SeedJobOptions = {
  status?: "PENDING" | "PROCESSING";
  leaseOwner?: string;
  leaseExpiresAt?: Date;
  nextAttemptAt?: Date;
  inputHash?: string;
  priority?: number;
  maxAttempts?: number;
};

async function seedJob(ownerId: string, id: string, postId: string, options: SeedJobOptions = {}): Promise<void> {
  await pool.query(
    `INSERT INTO place_analysis_jobs (
       id, owner_id, post_id, source_theme, depth, status, stage, priority,
       analysis_version, input_hash, attempt_count, max_attempts, lease_owner,
       lease_expires_at, next_attempt_at, created_at, updated_at
     ) VALUES ($1, $2, $3, 'travel', 'METADATA_ONLY', $4, 'QUEUED', $5, 'phase-e', $6, 0, $7, $8, $9, $10, now(), now())`,
    [
      id,
      ownerId,
      postId,
      options.status ?? "PENDING",
      options.priority ?? 0,
      options.inputHash ?? id,
      options.maxAttempts ?? 3,
      options.leaseOwner ?? null,
      options.leaseExpiresAt ?? null,
      options.nextAttemptAt ?? null,
    ],
  );
}
