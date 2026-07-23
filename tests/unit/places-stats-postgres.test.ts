// @vitest-environment node

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";

vi.mock("server-only", () => ({}));

const databaseUrl = process.env.TEST_DATABASE_URL?.trim() ?? "";
const describeWithDatabase = databaseUrl ? describe : describe.skip;
const OWNER_A = "owner-stats-a";
const OWNER_B = "owner-stats-b";

let prisma: PrismaClient;
let stats: typeof import("@/server/places/stats");
const previousDatabaseUrl = process.env.DATABASE_URL;

// A shared fixture: PA1 (FR/EU, EXACT, UNREVIEWED) linked to post1+post2, PA2
// (JP/AS, APPROXIMATE, CONFIRMED) linked to post1, PA3 (FR/EU, PROBABLE,
// REJECTED) linked to post3, plus one NEEDS_REVIEW job and a cross-owner place.
async function seedFixture(): Promise<void> {
  const post1 = await seedPost(OWNER_A, "Voyages");
  const post2 = await seedPost(OWNER_A, "Restaurant");
  const post3 = await seedPost(OWNER_A, "Voyages");

  const pa1 = await seedPlace(OWNER_A, { providerPlaceId: "fr-1", countryCode: "FR", continentCode: "EU", precision: "EXACT", reviewStatus: "UNREVIEWED" });
  const pa2 = await seedPlace(OWNER_A, { providerPlaceId: "jp-1", countryCode: "JP", continentCode: "AS", precision: "APPROXIMATE", approximationRadiusMeters: 25000, reviewStatus: "CONFIRMED" });
  const pa3 = await seedPlace(OWNER_A, { providerPlaceId: "fr-2", countryCode: "FR", continentCode: "EU", precision: "PROBABLE", reviewStatus: "REJECTED" });

  await linkPostPlace(OWNER_A, post1, pa1.id);
  await linkPostPlace(OWNER_A, post2, pa1.id);
  await linkPostPlace(OWNER_A, post1, pa2.id);
  await linkPostPlace(OWNER_A, post3, pa3.id);

  // Multiple evidence rows must never inflate distinct post counts.
  const job = await seedJob(OWNER_A, post1);
  await seedEvidence(OWNER_A, post1, pa1.id, job);
  await seedEvidence(OWNER_A, post1, pa1.id, job);

  // A NEEDS_REVIEW job (the UNKNOWN outcome) contributes to needsReview only.
  await prisma.placeAnalysisJob.create({
    data: { ownerId: OWNER_A, postId: post3, sourceTheme: "Voyages", analysisVersion: "places-v1", inputHash: "nr-1", status: "NEEDS_REVIEW" },
  });

  // Cross-owner data must be excluded entirely.
  const other = await seedPost(OWNER_B, "Voyages");
  const otherPlace = await seedPlace(OWNER_B, { providerPlaceId: "b-1", countryCode: "US", continentCode: "NA" });
  await linkPostPlace(OWNER_B, other, otherPlace.id);
}

describeWithDatabase("Places statistics on PostgreSQL", () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    ({ prisma } = await import("@/server/db"));
    stats = await import("@/server/places/stats");
    await resetDatabase();
  });

  afterAll(async () => {
    await resetDatabase();
    await prisma.$disconnect();
    process.env.DATABASE_URL = previousDatabaseUrl;
  });

  beforeEach(resetDatabase);

  it("computes distinct totals excluding rejected, unknown, and cross-owner data", async () => {
    await seedFixture();
    const result = await stats.getPlacesStats({}, OWNER_A);

    expect(result.totals.eligiblePosts).toBe(3);
    expect(result.totals.identifiedPlaces).toBe(2); // PA3 rejected excluded
    expect(result.totals.countries).toBe(2); // FR, JP
    expect(result.totals.continents).toBe(2); // EU, AS
    expect(result.totals.postsWithPlaces).toBe(2); // post1, post2 (post3 only links to a rejected place)
    expect(result.totals.needsReview).toBe(1); // one NEEDS_REVIEW job, no CONFLICT place
  });

  it("breaks down by theme, country, continent, precision, and review status", async () => {
    await seedFixture();
    const result = await stats.getPlacesStats({}, OWNER_A);

    const voyages = result.byTheme.find((row) => row.theme === "Voyages")!;
    const restaurant = result.byTheme.find((row) => row.theme === "Restaurant")!;
    expect(voyages).toMatchObject({ placeCount: 2, postCount: 1 });
    expect(restaurant).toMatchObject({ placeCount: 1, postCount: 1 });

    const fr = result.byCountry.find((row) => row.countryCode === "FR")!;
    expect(fr).toMatchObject({ placeCount: 1, postCount: 2 });
    const jp = result.byCountry.find((row) => row.countryCode === "JP")!;
    expect(jp).toMatchObject({ placeCount: 1, postCount: 1 });

    const eu = result.byContinent.find((row) => row.continentCode === "EU")!;
    expect(eu).toMatchObject({ placeCount: 1, countryCount: 1, postCount: 2 });

    expect(result.byPrecision.find((row) => row.precision === "EXACT")!.placeCount).toBe(1);
    expect(result.byPrecision.find((row) => row.precision === "APPROXIMATE")!.placeCount).toBe(1);
    // REJECTED is out of identified totals but visible in the review-status breakdown.
    expect(result.byReviewStatus.find((row) => row.reviewStatus === "REJECTED")!.placeCount).toBe(1);
  });

  it("applies the country filter to place-scoped aggregations", async () => {
    await seedFixture();
    const result = await stats.getPlacesStats({ countryCode: "FR" }, OWNER_A);
    expect(result.totals.identifiedPlaces).toBe(1); // only PA1 (PA3 rejected)
    expect(result.byCountry).toHaveLength(1);
    expect(result.byCountry[0].countryCode).toBe("FR");
    expect(result.totals.postsWithPlaces).toBe(2); // post1, post2 both link PA1
  });

  it("returns zeroed totals for an owner with no places", async () => {
    const result = await stats.getPlacesStats({}, OWNER_B);
    expect(result.totals.identifiedPlaces).toBe(0);
    expect(result.totals.eligiblePosts).toBe(0);
    expect(result.byCountry).toEqual([]);
  });
});

let placeCounter = 0;
let postCounter = 0;
let jobCounter = 0;

async function seedPlace(ownerId: string, overrides: Record<string, unknown> = {}) {
  placeCounter += 1;
  return prisma.place.create({
    data: {
      ownerId,
      displayName: "Place",
      normalizedName: "place",
      provider: "geoapify",
      providerPlaceId: `geo-${placeCounter}`,
      latitude: 25.1,
      longitude: 55.1,
      precision: "EXACT",
      confidence: 0.9,
      ...overrides,
    },
  });
}

async function seedPost(ownerId: string, mainTheme: string): Promise<string> {
  postCounter += 1;
  const post = await prisma.post.create({
    data: {
      ownerId,
      postUrl: `https://instagram.com/p/PS${postCounter}`,
      thumbnailUrl: "https://example.com/t.jpg",
      authorUsername: "alice",
      authorSortKey: "alice",
      caption: "A trip",
      searchText: "alice trip",
      contentType: "IMAGE",
      mainTheme,
    },
    select: { id: true },
  });
  return post.id;
}

async function seedJob(ownerId: string, postId: string): Promise<string> {
  jobCounter += 1;
  const job = await prisma.placeAnalysisJob.create({
    data: { ownerId, postId, sourceTheme: "Voyages", analysisVersion: "places-v1", inputHash: `sh-${jobCounter}` },
    select: { id: true },
  });
  return job.id;
}

async function linkPostPlace(ownerId: string, postId: string, placeId: string): Promise<void> {
  await prisma.postPlace.create({ data: { ownerId, postId, placeId, precision: "EXACT", confidence: 0.9 } });
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
