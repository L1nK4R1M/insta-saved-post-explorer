// @vitest-environment node

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";

vi.mock("server-only", () => ({}));

import * as mergeState from "@/lib/places/merge-state";
import * as reviewActor from "@/lib/places/review-actor";

const databaseUrl = process.env.TEST_DATABASE_URL?.trim() ?? "";
const describeWithDatabase = databaseUrl ? describe : describe.skip;
const OWNER_A = "owner-review-a";
const OWNER_B = "owner-review-b";

// A valid review context: an actor and a bounded reason.
const CTX = { actor: { type: "USER" as const, id: "local-admin" }, reason: "manual review" };

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

  it("confirms a place with an audit trail", async () => {
    const place = await seedPlace(OWNER_A);
    const post = await seedPost(OWNER_A);
    const job = await seedJob(OWNER_A, post);
    await linkPostPlace(OWNER_A, post, place.id, job);

    const result = await review.confirmPlace(OWNER_A, place.id, CTX);
    expect(result.reviewStatus).toBe("CONFIRMED");
    expect(result.isUserConfirmed).toBe(true);
    const audit = await prisma.placeEvidence.findFirstOrThrow({ where: { ownerId: OWNER_A, evidenceType: "USER_CORRECTION" } });
    expect(audit.excerpt).toBe("manual review");
    expect(audit.metadata).toMatchObject({ action: "PLACE_CONFIRMED", actorType: "USER", actorId: "local-admin" });
    expect(audit.analysisJobId).toBe(job);
  });

  it("rejects a place durably so automatic re-analysis cannot overwrite it", async () => {
    const place = await seedPlace(OWNER_A);
    const post = await seedPost(OWNER_A);
    const job = await seedJob(OWNER_A, post);
    await linkPostPlace(OWNER_A, post, place.id, job);
    await seedEvidence(OWNER_A, post, place.id, job);

    const result = await review.rejectPlaceResult(OWNER_A, place.id, CTX);
    expect(result.reviewStatus).toBe("REJECTED");
    expect(result.isUserConfirmed).toBe(true); // durable: F2 will not treat it as an unconfirmed automatic result
    expect(await prisma.postPlace.count({ where: { ownerId: OWNER_A } })).toBe(1);
    expect(await prisma.placeEvidence.count({ where: { ownerId: OWNER_A, evidenceType: "USER_CORRECTION" } })).toBe(1);
    // The original CAPTION evidence is kept too.
    expect(await prisma.placeEvidence.count({ where: { ownerId: OWNER_A, evidenceType: "CAPTION" } })).toBe(1);
  });

  it("records a user correction with actor metadata and makes the link the single primary", async () => {
    const place = await seedPlace(OWNER_A);
    const other = await seedPlace(OWNER_A, "geo-other");
    const post = await seedPost(OWNER_A);
    const job = await seedJob(OWNER_A, post);
    await linkPostPlace(OWNER_A, post, other.id, job, true); // existing primary
    await linkPostPlace(OWNER_A, post, place.id, job, false);

    const updated = await review.correctPostPlace(
      OWNER_A,
      { postId: post, placeId: place.id, isPrimary: true },
      { actor: { type: "ADMIN", id: "admin-7" }, reason: "user picked this" },
    );
    expect(updated.isUserConfirmed).toBe(true);
    expect(updated.isPrimary).toBe(true);
    expect(await prisma.postPlace.count({ where: { ownerId: OWNER_A, postId: post, isPrimary: true } })).toBe(1);
    const audit = await prisma.placeEvidence.findFirstOrThrow({ where: { ownerId: OWNER_A, evidenceType: "USER_CORRECTION" } });
    expect(audit.excerpt).toBe("user picked this");
    expect(audit.metadata).toMatchObject({ action: "POST_PLACE_CORRECTED", actorType: "ADMIN", actorId: "admin-7" });
  });

  it("rejects an invalid actor or reason with a stable code and never leaks them", async () => {
    const place = await seedPlace(OWNER_A);
    const post = await seedPost(OWNER_A);
    const job = await seedJob(OWNER_A, post);
    await linkPostPlace(OWNER_A, post, place.id, job);

    // Empty reason, oversized reason, empty actor id, and unknown actor type.
    await expect(review.confirmPlace(OWNER_A, place.id, { actor: CTX.actor, reason: "" })).rejects.toMatchObject({ code: "INVALID_REVIEW_CONTEXT" });
    await expect(review.confirmPlace(OWNER_A, place.id, { actor: CTX.actor, reason: "x".repeat(501) })).rejects.toMatchObject({ code: "INVALID_REVIEW_CONTEXT" });
    await expect(review.confirmPlace(OWNER_A, place.id, { actor: { type: "USER", id: "" }, reason: "ok" })).rejects.toMatchObject({ code: "INVALID_REVIEW_CONTEXT" });
    await expect(review.confirmPlace(OWNER_A, place.id, { actor: { type: "HACKER", id: "x" }, reason: "ok" })).rejects.toMatchObject({ code: "INVALID_REVIEW_CONTEXT" });

    // The actor and reason never appear in the thrown error.
    try {
      await review.confirmPlace(OWNER_A, place.id, { actor: { type: "HACKER", id: "SECRET-ACTOR" }, reason: "SECRET-REASON-123" });
      throw new Error("expected a review error");
    } catch (error) {
      const serialized = `${(error as Error).message} ${(error as Error).stack ?? ""}`;
      expect(serialized).not.toContain("SECRET-REASON-123");
      expect(serialized).not.toContain("SECRET-ACTOR");
    }
    // No mutation happened.
    expect((await prisma.place.findUniqueOrThrow({ where: { id: place.id } })).reviewStatus).toBe("UNREVIEWED");
  });

  it("fails before mutating when no post/job audit context exists", async () => {
    const place = await seedPlace(OWNER_A); // no links, no jobs
    await expect(review.confirmPlace(OWNER_A, place.id, CTX)).rejects.toMatchObject({ code: "PLACE_REVIEW_AUDIT_CONTEXT_MISSING" });
    expect((await prisma.place.findUniqueOrThrow({ where: { id: place.id } })).reviewStatus).toBe("UNREVIEWED");
    expect(await prisma.placeEvidence.count({ where: { ownerId: OWNER_A } })).toBe(0);
  });

  it("rolls back the mutation when audit evidence creation fails", async () => {
    const place = await seedPlace(OWNER_A);
    const post = await seedPost(OWNER_A);
    const job = await seedJob(OWNER_A, post);
    await linkPostPlace(OWNER_A, post, place.id, job);

    const spy = vi.spyOn(reviewActor, "buildAuditMetadata").mockImplementationOnce(() => {
      throw new Error("injected audit failure");
    });
    try {
      await expect(review.confirmPlace(OWNER_A, place.id, CTX)).rejects.toThrow("injected audit failure");
    } finally {
      spy.mockRestore();
    }
    expect((await prisma.place.findUniqueOrThrow({ where: { id: place.id } })).reviewStatus).toBe("UNREVIEWED");
    expect(await prisma.placeEvidence.count({ where: { ownerId: OWNER_A, evidenceType: "USER_CORRECTION" } })).toBe(0);
  });

  it("refuses to confirm, reject, or correct another owner's data without creating audit", async () => {
    const place = await seedPlace(OWNER_A);
    const post = await seedPost(OWNER_A);
    const job = await seedJob(OWNER_A, post);
    await linkPostPlace(OWNER_A, post, place.id, job);

    await expect(review.confirmPlace(OWNER_B, place.id, CTX)).rejects.toMatchObject({ code: "PLACE_NOT_FOUND" });
    await expect(review.rejectPlaceResult(OWNER_B, place.id, CTX)).rejects.toMatchObject({ code: "PLACE_NOT_FOUND" });
    await expect(review.correctPostPlace(OWNER_B, { postId: "nope", placeId: place.id }, CTX)).rejects.toMatchObject({ code: "POST_PLACE_NOT_FOUND" });
    expect(await prisma.placeEvidence.count({ where: { evidenceType: "USER_CORRECTION" } })).toBe(0);
  });

  it("merges a place into another, deduplicating links, keeping one primary, and auditing", async () => {
    const source = await seedPlace(OWNER_A, "geo-source");
    const target = await seedPlace(OWNER_A, "geo-target");
    const sharedPost = await seedPost(OWNER_A);
    const onlySourcePost = await seedPost(OWNER_A);
    const job = await seedJob(OWNER_A, sharedPost);
    const job2 = await seedJob(OWNER_A, onlySourcePost);
    await linkPostPlace(OWNER_A, sharedPost, target.id, job, true);
    await linkPostPlace(OWNER_A, sharedPost, source.id, job, false);
    await linkPostPlace(OWNER_A, onlySourcePost, source.id, job2, true);
    await seedEvidence(OWNER_A, sharedPost, source.id, job);

    const result = await review.mergePlaces(OWNER_A, { sourcePlaceId: source.id, targetPlaceId: target.id }, CTX);
    expect(result.id).toBe(target.id);
    expect(await prisma.place.count({ where: { id: source.id } })).toBe(0);
    expect(await prisma.postPlace.count({ where: { ownerId: OWNER_A, postId: sharedPost } })).toBe(1);
    expect(await prisma.postPlace.count({ where: { ownerId: OWNER_A, postId: onlySourcePost, placeId: target.id } })).toBe(1);
    expect(await prisma.postPlace.count({ where: { ownerId: OWNER_A, postId: sharedPost, isPrimary: true } })).toBe(1);
    expect(await prisma.postPlace.count({ where: { ownerId: OWNER_A, postId: onlySourcePost, isPrimary: true } })).toBe(1);
    // The moved CAPTION evidence is re-pointed to the target, not lost.
    expect(await prisma.placeEvidence.count({ where: { ownerId: OWNER_A, placeId: target.id, evidenceType: "CAPTION" } })).toBe(1);
    // Merge audit evidence is owner/place/post/job scoped to the target.
    const audits = await prisma.placeEvidence.findMany({ where: { ownerId: OWNER_A, placeId: target.id, evidenceType: "USER_CORRECTION" } });
    expect(audits.length).toBeGreaterThan(0);
    for (const audit of audits) {
      expect(audit.metadata).toMatchObject({ action: "PLACES_MERGED", actorType: "USER" });
      expect([sharedPost, onlySourcePost]).toContain(audit.postId);
      expect(audit.analysisJobId).toBeTruthy();
    }
  });

  it("preserves a user correction when merging", async () => {
    const source = await seedPlace(OWNER_A, "geo-s2");
    const target = await seedPlace(OWNER_A, "geo-t2");
    const post = await seedPost(OWNER_A);
    const job = await seedJob(OWNER_A, post);
    await linkPostPlace(OWNER_A, post, target.id, job, true, false);
    await linkPostPlace(OWNER_A, post, source.id, job, false, true); // user-confirmed on source

    await review.mergePlaces(OWNER_A, { sourcePlaceId: source.id, targetPlaceId: target.id }, CTX);
    const link = await prisma.postPlace.findFirstOrThrow({ where: { ownerId: OWNER_A, postId: post } });
    expect(link.placeId).toBe(target.id);
    expect(link.isUserConfirmed).toBe(true);
  });

  it("refuses a cross-owner or self merge", async () => {
    const a = await seedPlace(OWNER_A, "geo-a");
    const b = await seedPlace(OWNER_B, "geo-b");
    await expect(review.mergePlaces(OWNER_A, { sourcePlaceId: a.id, targetPlaceId: b.id }, CTX)).rejects.toMatchObject({ code: "PLACE_NOT_FOUND" });
    await expect(review.mergePlaces(OWNER_A, { sourcePlaceId: a.id, targetPlaceId: a.id }, CTX)).rejects.toMatchObject({ code: "INVALID_MERGE" });
  });

  it("carries a confirmed source review state onto an unreviewed target (F2 protection)", async () => {
    const source = await seedPlaceState(OWNER_A, "CONFIRMED", true, "geo-src-1");
    const target = await seedPlaceState(OWNER_A, "UNREVIEWED", false, "geo-tgt-1");

    const result = await review.mergePlaces(OWNER_A, { sourcePlaceId: source.id, targetPlaceId: target.id }, CTX);
    expect(result.reviewStatus).toBe("CONFIRMED");
    expect(result.isUserConfirmed).toBe(true); // F2 automatic re-analysis can no longer overwrite it
    expect(await prisma.place.count({ where: { id: source.id } })).toBe(0);
  });

  it("keeps an already-confirmed target confirmed", async () => {
    const source = await seedPlaceState(OWNER_A, "UNREVIEWED", false, "geo-src-2");
    const target = await seedPlaceState(OWNER_A, "CONFIRMED", true, "geo-tgt-2");
    const result = await review.mergePlaces(OWNER_A, { sourcePlaceId: source.id, targetPlaceId: target.id }, CTX);
    expect(result).toMatchObject({ reviewStatus: "CONFIRMED", isUserConfirmed: true });
  });

  it("keeps CONFIRMED when both sides are confirmed", async () => {
    const source = await seedPlaceState(OWNER_A, "CONFIRMED", true, "geo-src-3");
    const target = await seedPlaceState(OWNER_A, "CONFIRMED", true, "geo-tgt-3");
    const result = await review.mergePlaces(OWNER_A, { sourcePlaceId: source.id, targetPlaceId: target.id }, CTX);
    expect(result).toMatchObject({ reviewStatus: "CONFIRMED", isUserConfirmed: true });
  });

  it("resolves a confirmation-versus-rejection to CONFLICT while keeping the confirmation", async () => {
    const source = await seedPlaceState(OWNER_A, "CONFIRMED", true, "geo-src-4");
    const target = await seedPlaceState(OWNER_A, "REJECTED", false, "geo-tgt-4");
    const result = await review.mergePlaces(OWNER_A, { sourcePlaceId: source.id, targetPlaceId: target.id }, CTX);
    expect(result).toMatchObject({ reviewStatus: "CONFLICT", isUserConfirmed: true });
  });

  it("never downgrades an existing CONFLICT to UNREVIEWED", async () => {
    const source = await seedPlaceState(OWNER_A, "CONFLICT", false, "geo-src-5");
    const target = await seedPlaceState(OWNER_A, "UNREVIEWED", false, "geo-tgt-5");
    const result = await review.mergePlaces(OWNER_A, { sourcePlaceId: source.id, targetPlaceId: target.id }, CTX);
    expect(result.reviewStatus).toBe("CONFLICT");
  });

  it("lets a rejection dominate an unreviewed target when no confirmation exists", async () => {
    const source = await seedPlaceState(OWNER_A, "REJECTED", false, "geo-src-6");
    const target = await seedPlaceState(OWNER_A, "UNREVIEWED", false, "geo-tgt-6");
    const result = await review.mergePlaces(OWNER_A, { sourcePlaceId: source.id, targetPlaceId: target.id }, CTX);
    expect(result).toMatchObject({ reviewStatus: "REJECTED", isUserConfirmed: false });
  });

  it("rolls back completely when the merge fails mid-transaction", async () => {
    const source = await seedPlaceState(OWNER_A, "CONFIRMED", true, "geo-src-7");
    const target = await seedPlaceState(OWNER_A, "UNREVIEWED", false, "geo-tgt-7");
    const post = await seedPost(OWNER_A);
    const job = await seedJob(OWNER_A, post);
    await linkPostPlace(OWNER_A, post, source.id, job, true);
    await seedEvidence(OWNER_A, post, source.id, job);

    // Inject a failure at the review-state resolution step, after links and
    // evidence have been moved inside the transaction.
    const spy = vi.spyOn(mergeState, "resolveMergedPlaceReviewState").mockImplementationOnce(() => {
      throw new Error("injected merge failure");
    });
    try {
      await expect(
        review.mergePlaces(OWNER_A, { sourcePlaceId: source.id, targetPlaceId: target.id }, CTX),
      ).rejects.toThrow("injected merge failure");
    } finally {
      spy.mockRestore();
    }

    // Nothing changed: source present, target untouched, links and evidence on source.
    expect(await prisma.place.count({ where: { id: source.id } })).toBe(1);
    const targetAfter = await prisma.place.findUniqueOrThrow({ where: { id: target.id } });
    expect(targetAfter.reviewStatus).toBe("UNREVIEWED");
    expect(targetAfter.isUserConfirmed).toBe(false);
    const link = await prisma.postPlace.findFirstOrThrow({ where: { ownerId: OWNER_A, postId: post } });
    expect(link.placeId).toBe(source.id);
    expect(await prisma.placeEvidence.count({ where: { ownerId: OWNER_A, placeId: source.id } })).toBe(1);
    expect(await prisma.placeEvidence.count({ where: { ownerId: OWNER_A, placeId: target.id } })).toBe(0);
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

async function seedPlaceState(
  ownerId: string,
  reviewStatus: "UNREVIEWED" | "CONFIRMED" | "REJECTED" | "CONFLICT",
  isUserConfirmed: boolean,
  providerPlaceId: string,
) {
  return prisma.place.create({
    data: {
      ownerId,
      displayName: "Place",
      normalizedName: "place",
      provider: "geoapify",
      providerPlaceId,
      latitude: 25.1,
      longitude: 55.1,
      precision: "EXACT",
      confidence: 0.9,
      reviewStatus,
      isUserConfirmed,
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
