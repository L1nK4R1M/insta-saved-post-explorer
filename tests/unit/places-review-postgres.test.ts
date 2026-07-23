// @vitest-environment node

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";

vi.mock("server-only", () => ({}));

const databaseUrl = process.env.TEST_DATABASE_URL?.trim() ?? "";
const describeWithDatabase = databaseUrl ? describe : describe.skip;
const OWNER_A = "owner-review-a";
const OWNER_B = "owner-review-b";

let prisma: PrismaClient;
let review: typeof import("@/server/places/review");
const previousDatabaseUrl = process.env.DATABASE_URL;

describeWithDatabase("Places review and merge services on PostgreSQL", () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    ({ prisma } = await import("@/server/db"));
    review = await import("@/server/places/review");
    await resetDatabase();
  });

  afterAll(async () => {
    await resetDatabase();
    await prisma.$disconnect();
    process.env.DATABASE_URL = previousDatabaseUrl;
  });

  beforeEach(resetDatabase);

  it("confirms a place and marks it user-confirmed", async () => {
    const place = await seedPlace(OWNER_A);
    const result = await review.confirmPlace(OWNER_A, place.id);
    expect(result.reviewStatus).toBe("CONFIRMED");
    expect(result.isUserConfirmed).toBe(true);
  });

  it("rejects a place without deleting its links or evidence", async () => {
    const place = await seedPlace(OWNER_A);
    const post = await seedPost(OWNER_A);
    const job = await seedJob(OWNER_A, post);
    await linkPostPlace(OWNER_A, post, place.id, job);
    await seedEvidence(OWNER_A, post, place.id, job);

    const result = await review.rejectPlaceResult(OWNER_A, place.id);
    expect(result.reviewStatus).toBe("REJECTED");
    expect(await prisma.postPlace.count({ where: { ownerId: OWNER_A } })).toBe(1);
    expect(await prisma.placeEvidence.count({ where: { ownerId: OWNER_A } })).toBe(1);
  });

  it("records a user correction and makes the link the single primary", async () => {
    const place = await seedPlace(OWNER_A);
    const other = await seedPlace(OWNER_A, "geo-other");
    const post = await seedPost(OWNER_A);
    const job = await seedJob(OWNER_A, post);
    await linkPostPlace(OWNER_A, post, other.id, job, true); // existing primary
    await linkPostPlace(OWNER_A, post, place.id, job, false);

    const updated = await review.correctPostPlace(OWNER_A, { postId: post, placeId: place.id, isPrimary: true, reason: "user picked this" });
    expect(updated.isUserConfirmed).toBe(true);
    expect(updated.isPrimary).toBe(true);
    expect(await prisma.postPlace.count({ where: { ownerId: OWNER_A, postId: post, isPrimary: true } })).toBe(1);
    const evidence = await prisma.placeEvidence.findFirstOrThrow({ where: { ownerId: OWNER_A, evidenceType: "USER_CORRECTION" } });
    expect(evidence.excerpt).toBe("user picked this");
  });

  it("refuses to confirm, reject, or correct another owner's data", async () => {
    const place = await seedPlace(OWNER_A);
    await expect(review.confirmPlace(OWNER_B, place.id)).rejects.toMatchObject({ code: "PLACE_NOT_FOUND" });
    await expect(review.rejectPlaceResult(OWNER_B, place.id)).rejects.toMatchObject({ code: "PLACE_NOT_FOUND" });
    await expect(
      review.correctPostPlace(OWNER_B, { postId: "nope", placeId: place.id }),
    ).rejects.toMatchObject({ code: "POST_PLACE_NOT_FOUND" });
  });

  it("merges a place into another, deduplicating links and keeping one primary", async () => {
    const source = await seedPlace(OWNER_A, "geo-source");
    const target = await seedPlace(OWNER_A, "geo-target");
    const sharedPost = await seedPost(OWNER_A);
    const onlySourcePost = await seedPost(OWNER_A);
    const job = await seedJob(OWNER_A, sharedPost);
    const job2 = await seedJob(OWNER_A, onlySourcePost);
    // sharedPost links both source and target; onlySourcePost links only source (primary).
    await linkPostPlace(OWNER_A, sharedPost, target.id, job, true);
    await linkPostPlace(OWNER_A, sharedPost, source.id, job, false);
    await linkPostPlace(OWNER_A, onlySourcePost, source.id, job2, true);
    await seedEvidence(OWNER_A, sharedPost, source.id, job);

    const result = await review.mergePlaces(OWNER_A, { sourcePlaceId: source.id, targetPlaceId: target.id });
    expect(result.id).toBe(target.id);
    // Source place is gone.
    expect(await prisma.place.count({ where: { id: source.id } })).toBe(0);
    // sharedPost keeps exactly one link to target; onlySourcePost is moved to target.
    expect(await prisma.postPlace.count({ where: { ownerId: OWNER_A, postId: sharedPost } })).toBe(1);
    expect(await prisma.postPlace.count({ where: { ownerId: OWNER_A, postId: onlySourcePost, placeId: target.id } })).toBe(1);
    // Exactly one primary per affected post.
    expect(await prisma.postPlace.count({ where: { ownerId: OWNER_A, postId: sharedPost, isPrimary: true } })).toBe(1);
    expect(await prisma.postPlace.count({ where: { ownerId: OWNER_A, postId: onlySourcePost, isPrimary: true } })).toBe(1);
    // Evidence was re-pointed to the target, not lost.
    expect(await prisma.placeEvidence.count({ where: { ownerId: OWNER_A, placeId: target.id } })).toBe(1);
  });

  it("preserves a user correction when merging", async () => {
    const source = await seedPlace(OWNER_A, "geo-s2");
    const target = await seedPlace(OWNER_A, "geo-t2");
    const post = await seedPost(OWNER_A);
    const job = await seedJob(OWNER_A, post);
    await linkPostPlace(OWNER_A, post, target.id, job, true, false);
    await linkPostPlace(OWNER_A, post, source.id, job, false, true); // user-confirmed on source

    await review.mergePlaces(OWNER_A, { sourcePlaceId: source.id, targetPlaceId: target.id });
    const link = await prisma.postPlace.findFirstOrThrow({ where: { ownerId: OWNER_A, postId: post } });
    expect(link.placeId).toBe(target.id);
    expect(link.isUserConfirmed).toBe(true);
  });

  it("refuses a cross-owner or self merge", async () => {
    const a = await seedPlace(OWNER_A, "geo-a");
    const b = await seedPlace(OWNER_B, "geo-b");
    await expect(review.mergePlaces(OWNER_A, { sourcePlaceId: a.id, targetPlaceId: b.id })).rejects.toMatchObject({ code: "PLACE_NOT_FOUND" });
    await expect(review.mergePlaces(OWNER_A, { sourcePlaceId: a.id, targetPlaceId: a.id })).rejects.toMatchObject({ code: "INVALID_MERGE" });
  });
});

let placeCounter = 0;
let postCounter = 0;
let jobCounter = 0;

async function seedPlace(ownerId: string, providerPlaceId?: string) {
  placeCounter += 1;
  return prisma.place.create({
    data: {
      ownerId,
      displayName: "Place",
      normalizedName: "place",
      provider: "geoapify",
      providerPlaceId: providerPlaceId ?? `geo-${placeCounter}`,
      latitude: 25.1,
      longitude: 55.1,
      precision: "EXACT",
      confidence: 0.9,
    },
  });
}

async function seedPost(ownerId: string): Promise<string> {
  postCounter += 1;
  const post = await prisma.post.create({
    data: {
      ownerId,
      postUrl: `https://instagram.com/p/PR${postCounter}`,
      thumbnailUrl: "https://example.com/t.jpg",
      authorUsername: "alice",
      authorSortKey: "alice",
      caption: "A trip",
      searchText: "alice trip",
      contentType: "IMAGE",
      mainTheme: "Voyages",
    },
    select: { id: true },
  });
  return post.id;
}

async function seedJob(ownerId: string, postId: string): Promise<string> {
  jobCounter += 1;
  const job = await prisma.placeAnalysisJob.create({
    data: { ownerId, postId, sourceTheme: "Voyages", analysisVersion: "places-v1", inputHash: `rh-${jobCounter}` },
    select: { id: true },
  });
  return job.id;
}

async function linkPostPlace(
  ownerId: string,
  postId: string,
  placeId: string,
  analysisJobId: string,
  isPrimary = false,
  isUserConfirmed = false,
): Promise<void> {
  await prisma.postPlace.create({
    data: { ownerId, postId, placeId, analysisJobId, isPrimary, isUserConfirmed, precision: "EXACT", confidence: 0.9 },
  });
}

async function seedEvidence(ownerId: string, postId: string, placeId: string, analysisJobId: string): Promise<void> {
  await prisma.placeEvidence.create({
    data: { ownerId, postId, placeId, analysisJobId, evidenceType: "CAPTION", excerpt: "snippet", confidence: 0.8 },
  });
}

async function resetDatabase(): Promise<void> {
  const owners = { ownerId: { in: [OWNER_A, OWNER_B] } };
  await prisma.post.deleteMany({ where: owners });
  await prisma.place.deleteMany({ where: owners });
}
