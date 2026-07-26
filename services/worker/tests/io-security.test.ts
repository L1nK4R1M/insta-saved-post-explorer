import { Readable } from "node:stream";
import { lstat, mkdir, mkdtemp, readFile, readdir, rm, symlink, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { GetObjectCommand } from "@aws-sdk/client-s3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createReadOnlyMediaClient,
  type PersistedVerifiedMedia,
  type VerifiedMediaRepository,
} from "../src/r2/client.js";
import type { JobRepository } from "../src/db/jobs.js";
import { createRegistry, TerminalWorkerError } from "../src/runtime/dispatcher.js";
import { createWorkerRunner } from "../src/runtime/runner.js";
import { createShutdownController } from "../src/runtime/shutdown.js";
import { createTempWorkdirManager } from "../src/runtime/temp-workdir.js";

let sandbox: string;

beforeEach(async () => {
  sandbox = await mkdtemp(path.join(os.tmpdir(), "ipe-worker-io-"));
});

afterEach(async () => {
  await rm(sandbox, { recursive: true, force: true });
});

describe("temporary workdirs", () => {
  it("creates unique opaque directories and removes only contained paths", async () => {
    const root = path.join(sandbox, "worker-root");
    const manager = createTempWorkdirManager({ root, maxAgeMs: 1_000 });
    const first = await manager.create("../../attacker-job");
    const second = await manager.create("../../attacker-job");

    expect(first).not.toBe(second);
    expect(path.dirname(first)).toBe(path.resolve(root));
    expect(path.basename(first)).not.toContain("attacker");
    await expect(manager.remove(sandbox)).rejects.toThrow("WORKER_WORKDIR_UNSAFE");
    await manager.remove(first);
    await expect(lstat(first)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("removes stale entries, preserves recent entries, and never follows an escaping link", async () => {
    const root = path.join(sandbox, "worker-root");
    const outside = path.join(sandbox, "outside");
    await mkdir(root, { recursive: true });
    await mkdir(outside);
    await writeFile(path.join(outside, "sentinel"), "keep");
    const stale = path.join(root, "stale");
    const recent = path.join(root, "recent");
    const link = path.join(root, "linked");
    await mkdir(stale);
    await mkdir(recent);
    await symlink(outside, link, process.platform === "win32" ? "junction" : "dir");
    const now = new Date("2026-07-26T10:00:00.000Z");
    const old = new Date(now.getTime() - 2_000);
    await utimes(stale, old, old);
    await utimes(link, old, old);
    const manager = createTempWorkdirManager({ root, maxAgeMs: 1_000 });

    await expect(manager.cleanupStale(now)).resolves.toBe(2);
    expect(await readdir(root)).toEqual(["recent"]);
    await expect(readFile(path.join(outside, "sentinel"), "utf8")).resolves.toBe("keep");
  });

  it("leaves no real workdir after a terminal handler exception", async () => {
    const root = path.join(sandbox, "worker-root");
    const workdirs = createTempWorkdirManager({ root, maxAgeMs: 1_000 });
    const repository = {
      claimOne: vi.fn<JobRepository["claimOne"]>(async () => ({
        id: "job-failure",
        ownerId: "owner-1",
        type: "places.metadata",
        postId: "post-1",
        payload: {},
        attempt: 1,
        maxAttempts: 1,
        claimedBy: "worker-1",
        leaseExpiresAt: new Date(Date.now() + 90_000),
      })),
      heartbeat: vi.fn<JobRepository["heartbeat"]>(async () => true),
      succeed: vi.fn<JobRepository["succeed"]>(async () => true),
      retry: vi.fn<JobRepository["retry"]>(async () => true),
      fail: vi.fn<JobRepository["fail"]>(async () => true),
      ping: vi.fn<JobRepository["ping"]>(async () => undefined),
      close: vi.fn<JobRepository["close"]>(async () => undefined),
    };
    const logger = { child: () => logger, debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const runner = createWorkerRunner({
      repository,
      registry: createRegistry([{
        type: "places.metadata",
        parsePayload: () => ({}),
        run: async () => { throw new TerminalWorkerError("EXPECTED", "not persisted"); },
      }]),
      workerId: "worker-1",
      maxAttempts: 1,
      leaseDurationMs: 90_000,
      heartbeatIntervalMs: 30_000,
      shutdown: createShutdownController({ timeoutMs: 1_000 }),
      workdirs,
      clients: {},
      logger,
    });

    await expect(runner.runOnce()).resolves.toBe("failed");
    await expect(readdir(root)).resolves.toEqual([]);
  });
});

describe("read-only R2 media", () => {
  type SendGetObject = (command: GetObjectCommand) => Promise<{ Body?: unknown; ContentLength?: number }>;
  const persistedMedia = (override: Partial<PersistedVerifiedMedia> = {}): PersistedVerifiedMedia => ({
    id: "media-1",
    position: 0,
    objectKey: "originals/owner-1/post-1/image.jpg",
    byteSize: 4,
    mimeType: "image/jpeg",
    versionTag: "version-1",
    ...override,
  });

  it.each([
    ["missing media", null],
    ["prefix mismatch", persistedMedia({ objectKey: "private/image.jpg" })],
    ["key traversal", persistedMedia({ objectKey: "originals/../private/image.jpg" })],
    ["declared oversize", persistedMedia({ byteSize: 9 })],
  ])("rejects %s resolved by PostgreSQL before requesting R2", async (_name, resolved) => {
    const send = vi.fn<SendGetObject>();
    const scope = mediaClient(send, 8, repository(resolved));
    const workdir = path.join(sandbox, "job");
    await mkdir(workdir);

    await expect(scope.client.downloadToWorkdir("handler-controlled-id", workdir, new AbortController().signal)).rejects.toThrow(/WORKER_R2_/);
    expect(send).not.toHaveBeenCalled();
  });

  it("exposes safe references and uses only the canonical key resolved by PostgreSQL", async () => {
    const send = vi.fn<SendGetObject>(async () => ({ Body: Readable.from([Buffer.from("data")]), ContentLength: 4 }));
    const mediaRepository = repository(persistedMedia());
    const scope = mediaClient(send, 8, mediaRepository);
    const workdir = path.join(sandbox, "job");
    await mkdir(workdir);

    await expect(scope.client.listVerified()).resolves.toEqual([
      { id: "media-1", position: 0, mimeType: "image/jpeg", byteSize: 4 },
    ]);
    const output = await scope.client.downloadToWorkdir("originals/handler-forged.jpg", workdir, new AbortController().signal);

    const command = send.mock.calls[0]?.[0];
    expect(command).toBeInstanceOf(GetObjectCommand);
    expect(command?.input).toEqual({ Bucket: "media", Key: "originals/owner-1/post-1/image.jpg" });
    expect(path.dirname(output)).toBe(path.resolve(workdir));
    await expect(readFile(output, "utf8")).resolves.toBe("data");
    expect(Object.keys(scope.client).sort()).toEqual(["downloadToWorkdir", "listVerified"]);
    expect(mediaRepository.findVerified).toHaveBeenCalledWith("originals/handler-forged.jpg");
  });

  it("aborts oversized streams and removes partial output", async () => {
    const send = vi.fn<SendGetObject>(async () => ({ Body: Readable.from([Buffer.from("1234"), Buffer.from("56789")]) }));
    const scope = mediaClient(send, 8, repository(persistedMedia()));
    const workdir = path.join(sandbox, "job");
    await mkdir(workdir);

    await expect(scope.client.downloadToWorkdir("media-1", workdir, new AbortController().signal)).rejects.toThrow("WORKER_R2_TOO_LARGE");
    await expect(readdir(workdir)).resolves.toEqual([]);
  });
});

function mediaClient(
  send: (command: GetObjectCommand) => Promise<{ Body?: unknown; ContentLength?: number }>,
  maxBytes: number,
  mediaRepository: VerifiedMediaRepository,
) {
  return createReadOnlyMediaClient({
    accountId: "account-1",
    bucket: "media",
    accessKeyId: "access",
    secretAccessKey: "secret",
    keyPrefix: "originals",
    maxBytes,
    mediaRepository,
    s3: { send },
  });
}

function repository(resolved: PersistedVerifiedMedia | null): VerifiedMediaRepository {
  return {
    listVerified: vi.fn(async () => resolved ? [{
      id: resolved.id,
      position: resolved.position,
      mimeType: resolved.mimeType,
      byteSize: resolved.byteSize,
    }] : []),
    findVerified: vi.fn(async () => resolved),
  };
}
