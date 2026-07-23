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

function nobuCandidates() {
  return [
    {
      name: "Nobu Dubai",
      city: "Dubai",
      region: null,
      country: "United Arab Emirates",
      category: "restaurant",
      confidence: 0.95,
      evidence: [{ type: "CAPTION", excerpt: "Dinner at Nobu Dubai" }],
    },
  ];
}

// Build a candidate JSONL line stamped with the post's current input_hash and
// analysis_version, exactly as the exporter would produce. Overrides let a test
// forge a stale hash or a mismatched version.
async function candidateLine(
  postId: string,
  overrides: { inputHash?: string; analysisVersion?: string } = {},
): Promise<string> {
  const [line] = await batch.exportCaptionBatch({ ownerId: OWNER_A, postId, force: true });
  return JSON.stringify({
    post_id: postId,
    input_hash: overrides.inputHash ?? line.input_hash,
    analysis_version: overrides.analysisVersion ?? line.analysis_version,
    candidates: nobuCandidates(),
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
    // Every exported line carries the immutable analysis identity.
    expect(travel.input_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(travel.analysis_version).toBe("places-v1");
    expect(records.find((record) => record.post_id === "resto")!.main_theme).toBe("Restaurant");
    // No media URL or R2 field is ever emitted.
    expect(JSON.stringify(records)).not.toContain("objectKey");
  });

  it("excludes posts already analyzed for the current input hash unless forced", async () => {
    await seedPost("done", OWNER_A, "Voyages", {});
    await batch.importCandidateBatch({ ownerId: OWNER_A, jsonl: await candidateLine("done"), resolver: new FakeResolver(), commit: true });

    expect(await batch.exportCaptionBatch({ ownerId: OWNER_A })).toHaveLength(0);
    expect(await batch.exportCaptionBatch({ ownerId: OWNER_A, force: true })).toHaveLength(1);
  });

  it("writes nothing in dry-run mode", async () => {
    await seedPost("dry", OWNER_A, "Voyages", {});
    const report = await batch.importCandidateBatch({ ownerId: OWNER_A, jsonl: await candidateLine("dry"), resolver: new FakeResolver(), commit: false });
    expect(report.committed).toBe(false);
    expect(report.placesPersisted).toBeGreaterThan(0);
    expect(await prisma.place.count({ where: { ownerId: OWNER_A } })).toBe(0);
    expect(await prisma.placeAnalysisJob.count({ where: { ownerId: OWNER_A } })).toBe(0);
  });

  it("is idempotent when committed twice", async () => {
    await seedPost("idem", OWNER_A, "Voyages", {});
    const jsonl = await candidateLine("idem");
    await batch.importCandidateBatch({ ownerId: OWNER_A, jsonl, resolver: new FakeResolver(), commit: true });
    await batch.importCandidateBatch({ ownerId: OWNER_A, jsonl, resolver: new FakeResolver(), commit: true });
    expect(await prisma.place.count({ where: { ownerId: OWNER_A } })).toBe(1);
    expect(await prisma.postPlace.count({ where: { ownerId: OWNER_A } })).toBe(1);
  });

  it("rejects invalid lines unless continue-on-error is set", async () => {
    await seedPost("valid", OWNER_A, "Voyages", {});
    const jsonl = `${await candidateLine("valid")}\n{ not valid json`;

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
      jsonl: await candidateLine("owned"),
      resolver: new FakeResolver(),
      commit: true,
      continueOnError: true,
    });
    expect(report.postsFailed).toBe(1);
    expect(report.errors).toContainEqual({ line: 1, code: "POST_NOT_FOUND" });
    expect(await prisma.place.count({ where: { ownerId: OWNER_B } })).toBe(0);
  });

  it("accepts a candidate line whose hash and version match the current input", async () => {
    await seedPost("fresh", OWNER_A, "Voyages", {});
    const report = await batch.importCandidateBatch({
      ownerId: OWNER_A,
      jsonl: await candidateLine("fresh"),
      resolver: new FakeResolver(),
      commit: true,
    });
    expect(report.postsFailed).toBe(0);
    expect(await prisma.place.count({ where: { ownerId: OWNER_A } })).toBe(1);
  });

  it("rejects a stale result before Geoapify and writes nothing when the caption changed", async () => {
    await seedPost("stale-cap", OWNER_A, "Voyages", { caption: "Original caption #trip" });
    const jsonl = await candidateLine("stale-cap");
    // Caption changes after export: the exported analysis is now stale.
    await prisma.post.update({ where: { id: "stale-cap" }, data: { caption: "Completely different caption" } });

    const resolver = new FakeResolver();
    const resolveSpy = vi.spyOn(resolver, "resolve");
    await expect(
      batch.importCandidateBatch({ ownerId: OWNER_A, jsonl, resolver, commit: true }),
    ).rejects.toMatchObject({ code: "PLACES_INPUT_STALE" });

    expect(resolveSpy).not.toHaveBeenCalled();
    expect(await prisma.placeAnalysisJob.count({ where: { ownerId: OWNER_A } })).toBe(0);
    expect(await prisma.place.count({ where: { ownerId: OWNER_A } })).toBe(0);
    expect(await prisma.postPlace.count({ where: { ownerId: OWNER_A } })).toBe(0);
    expect(await prisma.placeEvidence.count({ where: { ownerId: OWNER_A } })).toBe(0);
  });

  it("rejects a stale result when an internal tag changed", async () => {
    await seedPost("stale-tag", OWNER_A, "Voyages", {});
    const jsonl = await candidateLine("stale-tag");
    // Attach a new internal tag after export → the input hash changes.
    const tag = await prisma.tag.create({ data: { ownerId: OWNER_A, name: "new-tag", slug: "new-tag" }, select: { id: true } });
    await prisma.postTag.create({ data: { postId: "stale-tag", tagId: tag.id } });

    const resolver = new FakeResolver();
    const resolveSpy = vi.spyOn(resolver, "resolve");
    await expect(
      batch.importCandidateBatch({ ownerId: OWNER_A, jsonl, resolver, commit: true }),
    ).rejects.toMatchObject({ code: "PLACES_INPUT_STALE" });
    expect(resolveSpy).not.toHaveBeenCalled();
    expect(await prisma.place.count({ where: { ownerId: OWNER_A } })).toBe(0);
  });

  it("rejects a mismatched analysis_version before any network call", async () => {
    await seedPost("wrong-version", OWNER_A, "Voyages", {});
    // Correct hash for the default version, but a different declared version:
    // recomputing with that version no longer matches the hash.
    const jsonl = await candidateLine("wrong-version", { analysisVersion: "places-v999" });

    const resolver = new FakeResolver();
    const resolveSpy = vi.spyOn(resolver, "resolve");
    await expect(
      batch.importCandidateBatch({ ownerId: OWNER_A, jsonl, resolver, commit: true }),
    ).rejects.toMatchObject({ code: "PLACES_INPUT_STALE" });
    expect(resolveSpy).not.toHaveBeenCalled();
  });

  it("records only a stable code, never the caption, under continue-on-error", async () => {
    await seedPost("stale-report", OWNER_A, "Voyages", { caption: "Secret caption CONFIDENTIAL-XYZ" });
    const jsonl = await candidateLine("stale-report");
    await prisma.post.update({ where: { id: "stale-report" }, data: { caption: "Changed" } });

    const report = await batch.importCandidateBatch({
      ownerId: OWNER_A,
      jsonl,
      resolver: new FakeResolver(),
      commit: true,
      continueOnError: true,
    });
    expect(report.postsFailed).toBe(1);
    expect(report.errors).toContainEqual({ line: 1, code: "PLACES_INPUT_STALE" });
    expect(JSON.stringify(report)).not.toContain("CONFIDENTIAL-XYZ");
  });

  it("rejects an old-format line without input_hash or analysis_version", async () => {
    await seedPost("old-format", OWNER_A, "Voyages", {});
    const jsonl = JSON.stringify({ post_id: "old-format", candidates: nobuCandidates() });
    const report = await batch.importCandidateBatch({
      ownerId: OWNER_A,
      jsonl,
      resolver: new FakeResolver(),
      commit: true,
      continueOnError: true,
    });
    expect(report.invalidRecords).toBe(1);
    expect(report.errors).toContainEqual({ line: 1, code: "INVALID_RECORD" });
    expect(await prisma.place.count({ where: { ownerId: OWNER_A } })).toBe(0);
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
  await prisma.tag.deleteMany({ where: owners });
}
