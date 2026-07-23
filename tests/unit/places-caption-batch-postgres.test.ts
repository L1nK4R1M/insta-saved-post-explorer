// @vitest-environment node

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";

vi.mock("server-only", () => ({}));

import type { PlaceResolutionInput, PlaceResolver, ResolvedPlaceCandidate } from "@/server/places/resolvers/types";

const databaseUrl = process.env.TEST_DATABASE_URL?.trim() ?? "";
const describeWithDatabase = databaseUrl ? describe : describe.skip;
const OWNER_A = "owner-batch-a";
const OWNER_B = "owner-batch-b";

let prisma: PrismaClient;
let batch: typeof import("@/server/places/caption-batch");
const previousDatabaseUrl = process.env.DATABASE_URL;

class FakeResolver implements PlaceResolver {
  async resolve(input: PlaceResolutionInput): Promise<ResolvedPlaceCandidate[]> {
    if (input.candidate.name !== "Nobu Dubai") return [];
    return [
      {
        provider: "geoapify",
        providerPlaceId: "geo-nobu",
        displayName: "Nobu Dubai",
        category: "catering.restaurant",
        address: "Atlantis, Dubai",
        city: "Dubai",
        region: null,
        country: "United Arab Emirates",
        countryCode: "AE",
        latitude: 25.13,
        longitude: 55.11,
        providerResultType: "amenity",
        providerRank: 0.95,
        attribution: "Powered by Geoapify",
      },
    ];
  }
}

function candidateLine(postId: string): string {
  return JSON.stringify({
    post_id: postId,
    candidates: [
      {
        name: "Nobu Dubai",
        city: "Dubai",
        region: null,
        country: "United Arab Emirates",
        category: "restaurant",
        confidence: 0.95,
        evidence: [{ type: "CAPTION", excerpt: "Dinner at Nobu Dubai" }],
      },
    ],
  });
}

describeWithDatabase("Places caption batch workflow on PostgreSQL", () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    ({ prisma } = await import("@/server/db"));
    batch = await import("@/server/places/caption-batch");
    await resetDatabase();
  });

  afterAll(async () => {
    await resetDatabase();
    await prisma.$disconnect();
    process.env.DATABASE_URL = previousDatabaseUrl;
  });

  beforeEach(resetDatabase);

  it("exports only theme-eligible posts, with bounded text fields and no collection dependency", async () => {
    await seedPost("travel", OWNER_A, "Voyages", { caption: "Great trip #travel #Dubai", metadata: { instagram_location: "Dubai, UAE" } });
    await seedPost("resto", OWNER_A, "restaurant", {}); // folded form of Restaurant
    await seedPost("cuisine", OWNER_A, "Cuisine", {});
    // Put the ineligible post in a collection to prove membership never grants export.
    const collection = await prisma.collection.create({ data: { ownerId: OWNER_A, name: "Lieux", slug: "lieux" }, select: { id: true } });
    await prisma.collectionPost.create({ data: { collectionId: collection.id, postId: "cuisine" } });

    const records = await batch.exportCaptionBatch({ ownerId: OWNER_A });
    const ids = records.map((record) => record.post_id).sort();
    expect(ids).toEqual(["resto", "travel"]);

    const travel = records.find((record) => record.post_id === "travel")!;
    expect(travel.main_theme).toBe("Voyages");
    expect(travel.hashtags).toEqual(["travel", "Dubai"]);
    expect(travel.instagram_location).toBe("Dubai, UAE");
    expect(records.find((record) => record.post_id === "resto")!.main_theme).toBe("Restaurant");
    // No media URL or R2 field is ever emitted.
    expect(JSON.stringify(records)).not.toContain("objectKey");
  });

  it("excludes posts already analyzed for the current input hash unless forced", async () => {
    await seedPost("done", OWNER_A, "Voyages", {});
    await batch.importCandidateBatch({ ownerId: OWNER_A, jsonl: candidateLine("done"), resolver: new FakeResolver(), commit: true });

    expect(await batch.exportCaptionBatch({ ownerId: OWNER_A })).toHaveLength(0);
    expect(await batch.exportCaptionBatch({ ownerId: OWNER_A, force: true })).toHaveLength(1);
  });

  it("writes nothing in dry-run mode", async () => {
    await seedPost("dry", OWNER_A, "Voyages", {});
    const report = await batch.importCandidateBatch({ ownerId: OWNER_A, jsonl: candidateLine("dry"), resolver: new FakeResolver(), commit: false });
    expect(report.committed).toBe(false);
    expect(report.placesPersisted).toBeGreaterThan(0);
    expect(await prisma.place.count({ where: { ownerId: OWNER_A } })).toBe(0);
    expect(await prisma.placeAnalysisJob.count({ where: { ownerId: OWNER_A } })).toBe(0);
  });

  it("is idempotent when committed twice", async () => {
    await seedPost("idem", OWNER_A, "Voyages", {});
    const jsonl = candidateLine("idem");
    await batch.importCandidateBatch({ ownerId: OWNER_A, jsonl, resolver: new FakeResolver(), commit: true });
    await batch.importCandidateBatch({ ownerId: OWNER_A, jsonl, resolver: new FakeResolver(), commit: true });
    expect(await prisma.place.count({ where: { ownerId: OWNER_A } })).toBe(1);
    expect(await prisma.postPlace.count({ where: { ownerId: OWNER_A } })).toBe(1);
  });

  it("rejects invalid lines unless continue-on-error is set", async () => {
    await seedPost("valid", OWNER_A, "Voyages", {});
    const jsonl = `${candidateLine("valid")}\n{ not valid json`;

    await expect(
      batch.importCandidateBatch({ ownerId: OWNER_A, jsonl, resolver: new FakeResolver(), commit: false }),
    ).rejects.toThrow();

    const report = await batch.importCandidateBatch({
      ownerId: OWNER_A,
      jsonl,
      resolver: new FakeResolver(),
      commit: false,
      continueOnError: true,
    });
    expect(report.invalidRecords).toBe(1);
    expect(report.validRecords).toBe(1);
    expect(report.errors).toContainEqual({ line: 2, code: "INVALID_RECORD" });
  });

  it("reports a not-found post owned by someone else without crossing owners", async () => {
    await seedPost("owned", OWNER_A, "Voyages", {});
    const report = await batch.importCandidateBatch({
      ownerId: OWNER_B,
      jsonl: candidateLine("owned"),
      resolver: new FakeResolver(),
      commit: true,
      continueOnError: true,
    });
    expect(report.postsFailed).toBe(1);
    expect(report.errors).toContainEqual({ line: 1, code: "POST_NOT_FOUND" });
    expect(await prisma.place.count({ where: { ownerId: OWNER_B } })).toBe(0);
  });
});

let postCounter = 0;

async function seedPost(
  id: string,
  ownerId: string,
  mainTheme: string,
  { caption, metadata }: { caption?: string; metadata?: Record<string, unknown> },
): Promise<void> {
  postCounter += 1;
  await prisma.post.create({
    data: {
      id,
      ownerId,
      postUrl: `https://instagram.com/p/PB${postCounter}`,
      thumbnailUrl: "https://example.com/t.jpg",
      authorUsername: "alice",
      authorSortKey: "alice",
      caption: caption ?? "A trip",
      searchText: "alice trip",
      contentType: "IMAGE",
      mainTheme,
      ...(metadata ? { metadata: metadata as object } : {}),
    },
  });
}

async function resetDatabase(): Promise<void> {
  const owners = { ownerId: { in: [OWNER_A, OWNER_B] } };
  await prisma.post.deleteMany({ where: owners });
  await prisma.place.deleteMany({ where: owners });
  await prisma.collection.deleteMany({ where: owners });
}
