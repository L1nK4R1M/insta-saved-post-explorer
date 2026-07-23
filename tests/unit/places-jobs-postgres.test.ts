// @vitest-environment node

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";

vi.mock("server-only", () => ({}));

const databaseUrl = process.env.TEST_DATABASE_URL?.trim() ?? "";
const describeWithDatabase = databaseUrl ? describe : describe.skip;
const OWNER_A = "owner-jobs-a";
const OWNER_B = "owner-jobs-b";

let prisma: PrismaClient;
let jobs: typeof import("@/server/places/jobs");
const previousDatabaseUrl = process.env.DATABASE_URL;

describeWithDatabase("Places metadata jobs on PostgreSQL", () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    ({ prisma } = await import("@/server/db"));
    jobs = await import("@/server/places/jobs");
    await resetDatabase();
  });

  afterAll(async () => {
    await resetDatabase();
    await prisma.$disconnect();
    process.env.DATABASE_URL = previousDatabaseUrl;
  });

  beforeEach(async () => {
    await resetDatabase();
    await seedFixtures();
  });

  it("creates one metadata job for the same owner, post, input, and version", async () => {
    const first = await jobs.createMetadataAnalysisJob({ ownerId: OWNER_A, postId: "travel-post" });
    const second = await jobs.createMetadataAnalysisJob({ ownerId: OWNER_A, postId: "travel-post" });
    expect(second.id).toBe(first.id);
    expect(first.depth).toBe("METADATA_ONLY");
    expect(first.sourceTheme).toBe("Voyages");
    expect(await prisma.placeAnalysisJob.count({ where: { ownerId: OWNER_A } })).toBe(1);
  });

  it("is idempotent under concurrency and never surfaces a P2002", async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        jobs.createMetadataAnalysisJob({ ownerId: OWNER_A, postId: "travel-post" }),
      ),
    );
    expect(new Set(results.map((job) => job.id)).size).toBe(1);
    expect(
      await prisma.placeAnalysisJob.count({ where: { ownerId: OWNER_A, postId: "travel-post" } }),
    ).toBe(1);
  });

  it("canonicalizes a folded eligible theme to its canonical form", async () => {
    const job = await jobs.createMetadataAnalysisJob({ ownerId: OWNER_A, postId: "resto-post" });
    expect(job.sourceTheme).toBe("Restaurant");
  });

  it("rejects a post whose theme is not Places-eligible", async () => {
    await expect(
      jobs.createMetadataAnalysisJob({ ownerId: OWNER_A, postId: "cuisine-post" }),
    ).rejects.toMatchObject({ code: "POST_NOT_PLACES_ELIGIBLE" });
    expect(await prisma.placeAnalysisJob.count({ where: { ownerId: OWNER_A } })).toBe(0);
  });

  it("does not depend on collection membership for eligibility", async () => {
    // An ineligible post that belongs to a collection is still rejected...
    await expect(
      jobs.createMetadataAnalysisJob({ ownerId: OWNER_A, postId: "cuisine-in-collection" }),
    ).rejects.toMatchObject({ code: "POST_NOT_PLACES_ELIGIBLE" });
    // ...and an eligible post in no collection still gets a job.
    const job = await jobs.createMetadataAnalysisJob({ ownerId: OWNER_A, postId: "travel-post" });
    expect(job.id).toBeDefined();
  });

  it("isolates jobs by owner and rejects a post owned by someone else", async () => {
    await expect(
      jobs.createMetadataAnalysisJob({ ownerId: OWNER_B, postId: "travel-post" }),
    ).rejects.toMatchObject({ code: "POST_NOT_FOUND" });
    expect(await prisma.placeAnalysisJob.count({ where: { ownerId: OWNER_B } })).toBe(0);
  });
});

async function resetDatabase(): Promise<void> {
  const owners = { ownerId: { in: [OWNER_A, OWNER_B] } };
  await prisma.post.deleteMany({ where: owners });
  await prisma.collection.deleteMany({ where: owners });
}

async function seedFixtures(): Promise<void> {
  await prisma.post.createMany({
    data: [
      basePost("travel-post", OWNER_A, "Voyages"),
      basePost("resto-post", OWNER_A, "restaurant"), // folded form of "Restaurant"
      basePost("cuisine-post", OWNER_A, "Cuisine"),
      basePost("cuisine-in-collection", OWNER_A, "Cuisine"),
    ],
  });
  // Put the ineligible post in a public collection to prove membership never
  // grants Places eligibility.
  const collection = await prisma.collection.create({
    data: { ownerId: OWNER_A, name: "Lieux", slug: "lieux", isPublic: true },
    select: { id: true },
  });
  await prisma.collectionPost.create({ data: { collectionId: collection.id, postId: "cuisine-in-collection" } });
}

function basePost(id: string, ownerId: string, mainTheme: string) {
  return {
    id,
    ownerId,
    postUrl: `https://instagram.com/p/${id}`,
    thumbnailUrl: "https://example.com/t.jpg",
    authorUsername: "alice",
    authorSortKey: "alice",
    caption: "A trip",
    searchText: "alice trip",
    contentType: "IMAGE" as const,
    mainTheme,
  };
}
