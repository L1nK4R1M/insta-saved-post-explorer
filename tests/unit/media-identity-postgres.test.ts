// @vitest-environment node

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// Mock only the network HEAD; keep deriveObjectKey (and the rest of r2) real.
const { headR2ObjectMock } = vi.hoisted(() => ({ headR2ObjectMock: vi.fn() }));
vi.mock("@/server/r2", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/r2")>();
  return { ...actual, headR2Object: headR2ObjectMock };
});

import type { PrismaClient } from "@prisma/client";

// These tests exercise the real PostgreSQL media-identity model and the
// restricted worker role. They are skipped without TEST_DATABASE_URL.
const databaseUrl = process.env.TEST_DATABASE_URL?.trim() ?? "";
const describeWithDatabase = databaseUrl ? describe : describe.skip;

const OWNER_A = "owner-mi-a";
const OWNER_B = "owner-mi-b";

let prisma: PrismaClient;
let mediaIdentity: typeof import("@/server/media-identity");
let importPosts: typeof import("@/server/import-posts")["importPosts"];
const previousDatabaseUrl = process.env.DATABASE_URL;
const previousPrefix = process.env.MEDIA_PATH_PREFIX;

describeWithDatabase("media identity on PostgreSQL", () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    process.env.MEDIA_PATH_PREFIX = "originals";
    ({ prisma } = await import("@/server/db"));
    mediaIdentity = await import("@/server/media-identity");
    ({ importPosts } = await import("@/server/import-posts"));
    await resetDatabase();
  });

  afterAll(async () => {
    await resetDatabase();
    await prisma.$disconnect();
    process.env.DATABASE_URL = previousDatabaseUrl;
    process.env.MEDIA_PATH_PREFIX = previousPrefix;
  });

  beforeEach(async () => {
    headR2ObjectMock.mockReset();
    await resetDatabase();
    await seedFixtures();
  });

  describe("persistVerifiedMediaIdentity (sync path)", () => {
    it("promotes only the given positions to VERIFIED, scoped to owner and post", async () => {
      const updated = await mediaIdentity.persistVerifiedMediaIdentity({
        ownerId: OWNER_A,
        postId: "post-a",
        media: [
          { position: 0, objectKey: "originals/alice/A/m0.jpg", mimeType: "image/jpeg", byteSize: 1234, versionTag: '"etag0"' },
        ],
      });
      expect(updated).toBe(1);

      const m0 = await mediaById("media-a0");
      expect(m0).toMatchObject({
        identityState: "VERIFIED",
        objectKey: "originals/alice/A/m0.jpg",
        mimeType: "image/jpeg",
        byteSize: 1234,
        versionTag: '"etag0"',
      });
      expect(m0?.checkedAt).toBeInstanceOf(Date);
      // Untouched siblings stay UNVERIFIED.
      expect((await mediaById("media-a1"))?.identityState).toBe("UNVERIFIED");
      // Cannot cross into another owner's post.
      const cross = await mediaIdentity.persistVerifiedMediaIdentity({
        ownerId: OWNER_A,
        postId: "post-b",
        media: [{ position: 0, objectKey: "x", mimeType: null, byteSize: 1, versionTag: null }],
      });
      expect(cross).toBe(0);
      expect((await mediaById("media-b0"))?.identityState).toBe("UNVERIFIED");
    });
  });

  describe("backfillMediaIdentity (D3 lazy backfill)", () => {
    it("promotes present objects to VERIFIED, absent to REPAIRABLE, and leaves keyless media UNVERIFIED", async () => {
      headR2ObjectMock.mockImplementation(async (objectKey: string) => {
        if (objectKey === "originals/alice/A/m0.jpg") {
          return { byteSize: 4096, mimeType: "image/jpeg", versionTag: '"real-etag"' };
        }
        return null; // m1's object is absent
      });

      const report = await mediaIdentity.backfillMediaIdentity({ ownerId: OWNER_A });
      // Two candidates have a sourcePath (m0, m1); the keyless one (m2) is excluded.
      expect(report).toEqual({ scanned: 2, verified: 1, repairable: 1 });

      expect(await mediaById("media-a0")).toMatchObject({
        identityState: "VERIFIED",
        objectKey: "originals/alice/A/m0.jpg",
        byteSize: 4096,
        mimeType: "image/jpeg",
        versionTag: '"real-etag"',
      });
      expect(await mediaById("media-a1")).toMatchObject({
        identityState: "REPAIRABLE",
        objectKey: "originals/alice/A/m1.jpg",
        byteSize: null,
      });
      expect((await mediaById("media-a2"))?.identityState).toBe("UNVERIFIED");
    });

    it("never fabricates identity and is scoped to the owner", async () => {
      headR2ObjectMock.mockResolvedValue(null);
      await mediaIdentity.backfillMediaIdentity({ ownerId: OWNER_A });
      // Owner B media is never touched while backfilling owner A.
      expect((await mediaById("media-b0"))?.identityState).toBe("UNVERIFIED");
      expect((await mediaById("media-b0"))?.objectKey).toBeNull();
      // A confirmed-absent object is REPAIRABLE, not VERIFIED — no invented identity.
      expect((await mediaById("media-a0"))?.byteSize).toBeNull();
      expect(headR2ObjectMock).not.toHaveBeenCalledWith(expect.stringContaining("bob"));
    });

    it("is idempotent: a second run over already-VERIFIED media rescans nothing", async () => {
      headR2ObjectMock.mockResolvedValue({ byteSize: 10, mimeType: "image/jpeg", versionTag: '"e"' });
      const first = await mediaIdentity.backfillMediaIdentity({ ownerId: OWNER_A });
      expect(first.verified).toBe(2);
      const second = await mediaIdentity.backfillMediaIdentity({ ownerId: OWNER_A });
      // m0/m1 are VERIFIED now; only nothing (m2 is keyless) remains to scan.
      expect(second).toEqual({ scanned: 0, verified: 0, repairable: 0 });
    });
  });

  describe("import path", () => {
    it("sets ownerId and leaves imported media UNVERIFIED", async () => {
      await importPosts(
        [{
          post_url: "https://instagram.com/p/IMP1",
          username: "alice",
          content_type: "image",
          thumbnail_url: "https://cdninstagram.com/t.jpg",
          media: [{ type: "image", url: "https://cdninstagram.com/i.jpg", source_path: "alice/IMP1/i.jpg" }],
        }],
        { ownerId: OWNER_A, batchSize: 1 },
      );
      const rows = await prisma.postMedia.findMany({
        where: { ownerId: OWNER_A, post: { postUrl: "https://instagram.com/p/IMP1" } },
        select: { ownerId: true, identityState: true, objectKey: true, sourcePath: true },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toEqual({
        ownerId: OWNER_A,
        identityState: "UNVERIFIED",
        objectKey: null,
        sourcePath: "alice/IMP1/i.jpg",
      });
    });
  });

  describe("restricted worker role", () => {
    it("can read identity columns but not url, other tables, or writes", async () => {
      // Allowed: identity/locator columns.
      await expect(
        prisma.$transaction(async (tx) => {
          await tx.$executeRawUnsafe("SET LOCAL ROLE ipe_worker_reader");
          return tx.$queryRawUnsafe('SELECT "object_key", "identity_state" FROM "post_media" LIMIT 1');
        }),
      ).resolves.toBeDefined();

      // Denied: the url column is not granted.
      await expect(
        prisma.$transaction(async (tx) => {
          await tx.$executeRawUnsafe("SET LOCAL ROLE ipe_worker_reader");
          return tx.$queryRawUnsafe('SELECT "url" FROM "post_media" LIMIT 1');
        }),
      ).rejects.toThrow(/permission denied/i);

      // Denied: another table entirely.
      await expect(
        prisma.$transaction(async (tx) => {
          await tx.$executeRawUnsafe("SET LOCAL ROLE ipe_worker_reader");
          return tx.$queryRawUnsafe('SELECT count(*) FROM "tags"');
        }),
      ).rejects.toThrow(/permission denied/i);

      // Denied: writes.
      await expect(
        prisma.$transaction(async (tx) => {
          await tx.$executeRawUnsafe("SET LOCAL ROLE ipe_worker_reader");
          return tx.$executeRawUnsafe(`UPDATE "post_media" SET "identity_state" = 'VERIFIED'`);
        }),
      ).rejects.toThrow(/permission denied/i);
    });
  });
});

async function mediaById(id: string) {
  return prisma.postMedia.findUnique({
    where: { id },
    select: { identityState: true, objectKey: true, mimeType: true, byteSize: true, versionTag: true, checkedAt: true },
  });
}

async function resetDatabase(): Promise<void> {
  const owners = { ownerId: { in: [OWNER_A, OWNER_B] } };
  await prisma.post.deleteMany({ where: owners });
  await prisma.tag.deleteMany({ where: owners });
}

async function seedFixtures(): Promise<void> {
  await prisma.post.createMany({
    data: [
      basePost("post-a", OWNER_A, "https://instagram.com/p/A", "alice"),
      basePost("post-b", OWNER_B, "https://instagram.com/p/B", "bob"),
    ],
  });
  // Owner A tag so the "other table" denial test has a row and owner scoping is real.
  await prisma.tag.create({ data: { ownerId: OWNER_A, name: "Mer", slug: "mer" } });

  await prisma.postMedia.createMany({
    data: [
      mediaRow("media-a0", "post-a", OWNER_A, 0, "alice/A/m0.jpg"),
      mediaRow("media-a1", "post-a", OWNER_A, 1, "alice/A/m1.jpg"),
      mediaRow("media-a2", "post-a", OWNER_A, 2, null), // keyless: stays UNVERIFIED
      mediaRow("media-b0", "post-b", OWNER_B, 0, "bob/B/m0.jpg"),
    ],
  });
}

function basePost(id: string, ownerId: string, postUrl: string, author: string) {
  return {
    id,
    ownerId,
    postUrl,
    thumbnailUrl: "https://example.com/t.jpg",
    authorUsername: author,
    authorSortKey: author,
    caption: "",
    searchText: author,
    contentType: "CAROUSEL" as const,
  };
}

function mediaRow(id: string, postId: string, ownerId: string, position: number, sourcePath: string | null) {
  return {
    id,
    postId,
    ownerId,
    type: "IMAGE" as const,
    // Keyless media (no source_path) still carries an arbitrary url, like a
    // legacy JSON import — the check constraint requires at least one source.
    url: sourcePath ? `https://cdn.example/${sourcePath}` : "https://cdn.example/legacy.jpg",
    sourcePath,
    thumbnailUrl: null,
    position,
  };
}
