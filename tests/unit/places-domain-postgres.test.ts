// @vitest-environment node

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";

vi.mock("server-only", () => ({}));

// Real PostgreSQL exercise of the Places domain schema and its SQL invariants.
// Skipped without TEST_DATABASE_URL.
const databaseUrl = process.env.TEST_DATABASE_URL?.trim() ?? "";
const describeWithDatabase = databaseUrl ? describe : describe.skip;
const OWNER_A = "owner-places-a";
const OWNER_B = "owner-places-b";

let prisma: PrismaClient;
const previousDatabaseUrl = process.env.DATABASE_URL;

describeWithDatabase("Places domain on PostgreSQL", () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    ({ prisma } = await import("@/server/db"));
    await resetDatabase();
  });

  afterAll(async () => {
    await resetDatabase();
    await prisma.$disconnect();
    process.env.DATABASE_URL = previousDatabaseUrl;
  });

  beforeEach(resetDatabase);

  it("deduplicates a provider place per owner", async () => {
    const data = placeData(OWNER_A);
    await prisma.place.create({ data });
    await expect(prisma.place.create({ data })).rejects.toThrow();
    await expect(
      prisma.place.create({ data: placeData(OWNER_B) }),
    ).resolves.toBeDefined();
  });

  it("isolates places between owners", async () => {
    await prisma.place.create({ data: placeData(OWNER_A) });
    expect(await prisma.place.count({ where: { ownerId: OWNER_B } })).toBe(0);
    expect(await prisma.place.count({ where: { ownerId: OWNER_A } })).toBe(1);
  });

  it("rejects invalid coordinates", async () => {
    await expect(
      prisma.place.create({ data: { ...placeData(OWNER_A), latitude: 91 } }),
    ).rejects.toThrow();
    await expect(
      prisma.place.create({ data: { ...placeData(OWNER_A), providerPlaceId: "geo-lon", longitude: 181 } }),
    ).rejects.toThrow();
  });

  it("rejects out-of-range confidence", async () => {
    await expect(
      prisma.place.create({ data: { ...placeData(OWNER_A), confidence: 1.5 } }),
    ).rejects.toThrow();
  });

  it("requires a radius only for approximate places", async () => {
    // APPROXIMATE without a radius is rejected.
    await expect(
      prisma.place.create({
        data: { ...placeData(OWNER_A), providerPlaceId: "approx-null", precision: "APPROXIMATE", approximationRadiusMeters: null },
      }),
    ).rejects.toThrow();
    // APPROXIMATE with a positive radius is accepted.
    await expect(
      prisma.place.create({
        data: { ...placeData(OWNER_A), providerPlaceId: "approx-ok", precision: "APPROXIMATE", approximationRadiusMeters: 25_000 },
      }),
    ).resolves.toBeDefined();
    // EXACT/PROBABLE with a radius are rejected.
    await expect(
      prisma.place.create({
        data: { ...placeData(OWNER_A), providerPlaceId: "exact-radius", precision: "EXACT", approximationRadiusMeters: 10 },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.place.create({
        data: { ...placeData(OWNER_A), providerPlaceId: "probable-radius", precision: "PROBABLE", approximationRadiusMeters: 10 },
      }),
    ).rejects.toThrow();
  });

  it("allows only one canonical link per owner, post, and place", async () => {
    const { postId, placeId } = await seedPostAndPlace(OWNER_A);
    await prisma.postPlace.create({ data: { ownerId: OWNER_A, postId, placeId, precision: "EXACT", confidence: 0.9 } });
    await expect(
      prisma.postPlace.create({ data: { ownerId: OWNER_A, postId, placeId, precision: "EXACT", confidence: 0.8 } }),
    ).rejects.toThrow();
  });

  it("allows only one primary place per owner and post", async () => {
    const { postId, placeId } = await seedPostAndPlace(OWNER_A);
    const otherPlace = await prisma.place.create({ data: placeData(OWNER_A, "geo-2") });
    await prisma.postPlace.create({ data: { ownerId: OWNER_A, postId, placeId, isPrimary: true, precision: "EXACT", confidence: 0.9 } });
    await expect(
      prisma.postPlace.create({ data: { ownerId: OWNER_A, postId, placeId: otherPlace.id, isPrimary: true, precision: "EXACT", confidence: 0.9 } }),
    ).rejects.toThrow();
    // A second non-primary link to a distinct place is allowed.
    await expect(
      prisma.postPlace.create({ data: { ownerId: OWNER_A, postId, placeId: otherPlace.id, isPrimary: false, precision: "PROBABLE", confidence: 0.8 } }),
    ).resolves.toBeDefined();
  });

  it("cascades links, evidence, and jobs when a post is deleted, keeping the place", async () => {
    const { postId, placeId, jobId } = await seedFullGraph(OWNER_A);
    await prisma.postPlace.create({ data: { ownerId: OWNER_A, postId, placeId, analysisJobId: jobId, precision: "EXACT", confidence: 0.9 } });
    await prisma.placeEvidence.create({ data: { ownerId: OWNER_A, postId, placeId, analysisJobId: jobId, evidenceType: "CAPTION", confidence: 0.7 } });

    await prisma.post.delete({ where: { id: postId } });

    expect(await prisma.postPlace.count({ where: { ownerId: OWNER_A } })).toBe(0);
    expect(await prisma.placeEvidence.count({ where: { ownerId: OWNER_A } })).toBe(0);
    expect(await prisma.placeAnalysisJob.count({ where: { ownerId: OWNER_A } })).toBe(0);
    // The canonical place is independent of any single post and survives.
    expect(await prisma.place.count({ where: { id: placeId } })).toBe(1);
  });

  // Composite foreign keys must bind owner_id to every parent and bind
  // analysis_job_id to the same owner and post, so a row scoped to one owner
  // can never reference another owner's (or another post's) data.
  describe("owner- and post-consistent foreign keys", () => {
    it("rejects a PostPlace whose post belongs to another owner", async () => {
      const postB = await seedPost(OWNER_B);
      const placeA = await prisma.place.create({ data: placeData(OWNER_A) });
      await expect(
        prisma.postPlace.create({
          data: { ownerId: OWNER_A, postId: postB, placeId: placeA.id, precision: "EXACT", confidence: 0.9 },
        }),
      ).rejects.toThrow();
    });

    it("rejects a PostPlace whose place belongs to another owner", async () => {
      const postA = await seedPost(OWNER_A);
      const placeB = await prisma.place.create({ data: placeData(OWNER_B) });
      await expect(
        prisma.postPlace.create({
          data: { ownerId: OWNER_A, postId: postA, placeId: placeB.id, precision: "EXACT", confidence: 0.9 },
        }),
      ).rejects.toThrow();
    });

    it("rejects a PostPlace referencing a job owned by someone else", async () => {
      const postA = await seedPost(OWNER_A);
      const placeA = await prisma.place.create({ data: placeData(OWNER_A) });
      const postB = await seedPost(OWNER_B);
      const jobB = await seedJobFor(OWNER_B, postB);
      await expect(
        prisma.postPlace.create({
          data: { ownerId: OWNER_A, postId: postA, placeId: placeA.id, analysisJobId: jobB, precision: "EXACT", confidence: 0.9 },
        }),
      ).rejects.toThrow();
    });

    it("rejects a PostPlace referencing a job of a different post", async () => {
      const postX = await seedPost(OWNER_A);
      const postY = await seedPost(OWNER_A);
      const placeA = await prisma.place.create({ data: placeData(OWNER_A) });
      const jobY = await seedJobFor(OWNER_A, postY);
      await expect(
        prisma.postPlace.create({
          data: { ownerId: OWNER_A, postId: postX, placeId: placeA.id, analysisJobId: jobY, precision: "EXACT", confidence: 0.9 },
        }),
      ).rejects.toThrow();
    });

    it("rejects a PlaceEvidence whose post belongs to another owner", async () => {
      const postA = await seedPost(OWNER_A);
      const postB = await seedPost(OWNER_B);
      const jobA = await seedJobFor(OWNER_A, postA);
      await expect(
        prisma.placeEvidence.create({
          data: { ownerId: OWNER_A, postId: postB, analysisJobId: jobA, evidenceType: "CAPTION", confidence: 0.7 },
        }),
      ).rejects.toThrow();
    });

    it("rejects a PlaceEvidence whose place belongs to another owner", async () => {
      const postA = await seedPost(OWNER_A);
      const placeB = await prisma.place.create({ data: placeData(OWNER_B) });
      const jobA = await seedJobFor(OWNER_A, postA);
      await expect(
        prisma.placeEvidence.create({
          data: { ownerId: OWNER_A, postId: postA, placeId: placeB.id, analysisJobId: jobA, evidenceType: "CAPTION", confidence: 0.7 },
        }),
      ).rejects.toThrow();
    });

    it("rejects a PlaceEvidence referencing a job of a different post", async () => {
      const postX = await seedPost(OWNER_A);
      const postY = await seedPost(OWNER_A);
      const jobY = await seedJobFor(OWNER_A, postY);
      await expect(
        prisma.placeEvidence.create({
          data: { ownerId: OWNER_A, postId: postX, analysisJobId: jobY, evidenceType: "CAPTION", confidence: 0.7 },
        }),
      ).rejects.toThrow();
    });

    it("rejects a PlaceAnalysisJob whose post belongs to another owner", async () => {
      const postB = await seedPost(OWNER_B);
      await expect(
        prisma.placeAnalysisJob.create({
          data: { ownerId: OWNER_A, postId: postB, sourceTheme: "Voyages", analysisVersion: "places-v1", inputHash: "cross-owner" },
        }),
      ).rejects.toThrow();
    });

    it("still accepts a fully consistent owner/post/place/job graph", async () => {
      const { postId, placeId, jobId } = await seedFullGraph(OWNER_A);
      await expect(
        prisma.postPlace.create({
          data: { ownerId: OWNER_A, postId, placeId, analysisJobId: jobId, precision: "EXACT", confidence: 0.9 },
        }),
      ).resolves.toBeDefined();
      await expect(
        prisma.placeEvidence.create({
          data: { ownerId: OWNER_A, postId, placeId, analysisJobId: jobId, evidenceType: "CAPTION", confidence: 0.7 },
        }),
      ).resolves.toBeDefined();
    });
  });
});

function placeData(ownerId: string, providerPlaceId = "geo-1") {
  return {
    ownerId,
    displayName: "Nobu Dubai",
    normalizedName: "nobu dubai",
    provider: "geoapify",
    providerPlaceId,
    latitude: 25.141,
    longitude: 55.186,
    precision: "EXACT" as const,
    confidence: 0.95,
  };
}

let postCounter = 0;

async function seedPost(ownerId: string): Promise<string> {
  postCounter += 1;
  const post = await prisma.post.create({
    data: {
      ownerId,
      postUrl: `https://instagram.com/p/PF${postCounter}`,
      thumbnailUrl: "https://example.com/t.jpg",
      authorUsername: "alice",
      authorSortKey: "alice",
      caption: "",
      searchText: "alice",
      contentType: "IMAGE",
      mainTheme: "Voyages",
    },
    select: { id: true },
  });
  return post.id;
}

async function seedPostAndPlace(ownerId: string): Promise<{ postId: string; placeId: string }> {
  const postId = await seedPost(ownerId);
  const place = await prisma.place.create({ data: placeData(ownerId) });
  return { postId, placeId: place.id };
}

let jobCounter = 0;

async function seedJobFor(ownerId: string, postId: string): Promise<string> {
  jobCounter += 1;
  const job = await prisma.placeAnalysisJob.create({
    data: { ownerId, postId, sourceTheme: "Voyages", analysisVersion: "places-v1", inputHash: `hash-${jobCounter}` },
    select: { id: true },
  });
  return job.id;
}

async function seedFullGraph(ownerId: string): Promise<{ postId: string; placeId: string; jobId: string }> {
  const { postId, placeId } = await seedPostAndPlace(ownerId);
  const jobId = await seedJobFor(ownerId, postId);
  return { postId, placeId, jobId };
}

async function resetDatabase(): Promise<void> {
  const owners = { ownerId: { in: [OWNER_A, OWNER_B] } };
  await prisma.post.deleteMany({ where: owners });
  await prisma.place.deleteMany({ where: owners });
}
