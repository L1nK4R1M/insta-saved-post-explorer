import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";

import { GetObjectCommand } from "@aws-sdk/client-s3";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createJobRepository } from "../src/db/jobs.js";
import { createVerifiedMediaRepository } from "../src/db/media.js";
import { createReadOnlyMediaClient } from "../src/r2/client.js";
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

  it("terminalizes an expired lease after the effective final attempt", async () => {
    const now = new Date("2026-07-26T10:00:00.000Z");
    await seedJob(OWNER_A, "expired-final", "post-worker-a", {
      status: "PROCESSING",
      leaseOwner: "dead-worker",
      leaseExpiresAt: new Date(now.getTime() - 1),
      attemptCount: 2,
      maxAttempts: 2,
    });
    const repository = createJobRepository(pool, { ownerId: OWNER_A });

    await expect(repository.claimOne({ workerId: "replacement", leaseDurationMs: 90_000, maxAttempts: 3, now })).resolves.toBeNull();
    const row = await pool.query<{ status: string; error_code: string }>(
      "SELECT status, error_code FROM place_analysis_jobs WHERE owner_id = $1 AND id = $2",
      [OWNER_A, "expired-final"],
    );
    expect(row.rows[0]).toEqual({ status: "FAILED", error_code: "ATTEMPTS_EXHAUSTED" });
  });

  it("terminalizes exhausted pending jobs at row or worker limits without crossing owner or terminal boundaries", async () => {
    const now = new Date("2026-07-26T10:00:00.000Z");
    await seedJob(OWNER_A, "pending-row-limit", "post-worker-a", { attemptCount: 2, maxAttempts: 2 });
    await seedJob(OWNER_A, "pending-worker-limit", "post-worker-a", {
      attemptCount: 2,
      maxAttempts: 5,
      inputHash: randomUUID(),
      nextAttemptAt: new Date(now.getTime() + 60_000),
    });
    await seedJob(OWNER_A, "pending-under-limit", "post-worker-a", {
      attemptCount: 1,
      maxAttempts: 3,
      inputHash: randomUUID(),
      priority: 10,
    });
    await seedJob(OWNER_B, "pending-other-owner", "post-worker-b", {
      attemptCount: 2,
      maxAttempts: 2,
    });
    await seedJob(OWNER_A, "terminal-existing", "post-worker-a", {
      status: "FAILED",
      stage: "COMPLETE",
      attemptCount: 2,
      maxAttempts: 2,
      inputHash: randomUUID(),
    });
    const repository = createJobRepository(pool, { ownerId: OWNER_A });

    await expect(
      repository.claimOne({ workerId: "worker-1", leaseDurationMs: 90_000, maxAttempts: 2, now }),
    ).resolves.toMatchObject({ id: "pending-under-limit", attempt: 2 });

    const rows = await pool.query<{
      id: string;
      owner_id: string;
      status: string;
      stage: string;
      error_code: string | null;
      completed_at: Date | null;
      lease_owner: string | null;
      lease_expires_at: Date | null;
      heartbeat_at: Date | null;
      next_attempt_at: Date | null;
    }>(
      `SELECT id, owner_id, status, stage, error_code, completed_at,
              lease_owner, lease_expires_at, heartbeat_at, next_attempt_at
       FROM place_analysis_jobs
       WHERE id = ANY($1::text[])
       ORDER BY id`,
      [["pending-row-limit", "pending-worker-limit", "pending-under-limit", "pending-other-owner", "terminal-existing"]],
    );
    const byId = new Map(rows.rows.map((row) => [row.id, row]));

    for (const id of ["pending-row-limit", "pending-worker-limit"]) {
      expect(byId.get(id)).toMatchObject({
        owner_id: OWNER_A,
        status: "FAILED",
        stage: "COMPLETE",
        error_code: "ATTEMPTS_EXHAUSTED",
        lease_owner: null,
        lease_expires_at: null,
        heartbeat_at: null,
        next_attempt_at: null,
      });
      expect(byId.get(id)?.completed_at).toEqual(now);
    }
    expect(byId.get("pending-under-limit")?.status).toBe("PROCESSING");
    expect(byId.get("pending-other-owner")?.status).toBe("PENDING");
    expect(byId.get("terminal-existing")).toMatchObject({ status: "FAILED", error_code: null });
  });

  it("authorizes GetObject only from the persisted owner-post media identity", async () => {
    await seedPost(OWNER_A, "post-worker-a-other");
    await seedMedia("media-verified", OWNER_A, "post-worker-a", "VERIFIED", "originals/persisted/canonical.jpg", 0);
    await seedMedia("media-other-post", OWNER_A, "post-worker-a-other", "VERIFIED", "originals/persisted/other-post.jpg", 0);
    await seedMedia("media-other-owner", OWNER_B, "post-worker-b", "VERIFIED", "originals/persisted/other-owner.jpg", 0);
    await seedMedia("media-unverified", OWNER_A, "post-worker-a", "UNVERIFIED", null, 1);
    await seedMedia("media-repairable", OWNER_A, "post-worker-a", "REPAIRABLE", "originals/persisted/repairable.jpg", 2);
    const send = vi.fn(async (command: GetObjectCommand) => {
      expect(command).toBeInstanceOf(GetObjectCommand);
      return {
        Body: Readable.from([Buffer.from("persisted-media")]),
        ContentLength: 15,
      };
    });
    const scope = createReadOnlyMediaClient({
      accountId: "account-1",
      bucket: "media-bucket",
      accessKeyId: "access",
      secretAccessKey: "secret",
      keyPrefix: "originals",
      maxBytes: 1_024,
      mediaRepository: createVerifiedMediaRepository(pool, { ownerId: OWNER_A, postId: "post-worker-a" }),
      s3: { send },
    });

    await expect(scope.client.listVerified()).resolves.toEqual([
      { id: "media-verified", position: 0, mimeType: "image/jpeg", byteSize: 15 },
    ]);
    for (const mediaId of [
      "media-other-post",
      "media-other-owner",
      "media-unverified",
      "media-repairable",
      "media-missing",
    ]) {
      await expect(
        scope.client.downloadToWorkdir(mediaId, "unused-before-authorization", new AbortController().signal),
      ).rejects.toMatchObject({ code: "WORKER_R2_NOT_AUTHORIZED" });
    }
    expect(send).not.toHaveBeenCalled();

    const workdir = await mkdtemp(path.join(os.tmpdir(), "ipe-worker-media-pg-"));
    try {
      const output = await scope.client.downloadToWorkdir(
        "media-verified",
        workdir,
        new AbortController().signal,
      );
      await expect(readFile(output, "utf8")).resolves.toBe("persisted-media");
      expect(send.mock.calls[0]?.[0].input).toEqual({
        Bucket: "media-bucket",
        Key: "originals/persisted/canonical.jpg",
      });
    } finally {
      await scope.close();
      await rm(workdir, { recursive: true, force: true });
    }
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

async function seedMedia(
  id: string,
  ownerId: string,
  postId: string,
  identityState: "UNVERIFIED" | "REPAIRABLE" | "VERIFIED",
  objectKey: string | null,
  position: number,
): Promise<void> {
  await pool.query(
    `INSERT INTO post_media (
       id, post_id, type, url, position, owner_id, object_key, mime_type,
       byte_size, version_tag, identity_state, checked_at
     ) VALUES ($1, $2, 'IMAGE', $3, $4, $5, $6, 'image/jpeg', $7, 'version-1', $8, now())`,
    [id, postId, `https://example.test/${id}.jpg`, position, ownerId, objectKey, objectKey ? 15 : null, identityState],
  );
}

type SeedJobOptions = {
  status?: "PENDING" | "PROCESSING" | "FAILED";
  stage?: "QUEUED" | "COMPLETE";
  leaseOwner?: string;
  leaseExpiresAt?: Date;
  nextAttemptAt?: Date;
  inputHash?: string;
  priority?: number;
  maxAttempts?: number;
  attemptCount?: number;
};

async function seedJob(ownerId: string, id: string, postId: string, options: SeedJobOptions = {}): Promise<void> {
  await pool.query(
    `INSERT INTO place_analysis_jobs (
       id, owner_id, post_id, source_theme, depth, status, stage, priority,
       analysis_version, input_hash, attempt_count, max_attempts, lease_owner,
       lease_expires_at, next_attempt_at, created_at, updated_at
     ) VALUES ($1, $2, $3, 'travel', 'METADATA_ONLY', $4, $5, $6, 'phase-e', $7, $8, $9, $10, $11, $12, now(), now())`,
    [
      id,
      ownerId,
      postId,
      options.status ?? "PENDING",
      options.stage ?? "QUEUED",
      options.priority ?? 0,
      options.inputHash ?? id,
      options.attemptCount ?? 0,
      options.maxAttempts ?? 3,
      options.leaseOwner ?? null,
      options.leaseExpiresAt ?? null,
      options.nextAttemptAt ?? null,
    ],
  );
}
