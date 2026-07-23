# Phase F Places Metadata-First Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the owner-scoped Places domain, Geoapify-backed geographic resolution, local caption-only workflow, read API, statistics, and review services without requiring a VPS.

**Architecture:** `Post.mainTheme` eligibility is already centralized in `isPlacesEligibleTheme()`. Claude or Codex CLI produces textual candidates outside the application; the application validates those candidates, resolves them through a replaceable Geoapify adapter, scores them deterministically, and persists canonical places atomically. The external `/api/v1` remains read-only.

**Tech Stack:** Node.js 24, Next.js 16, TypeScript 5.9 strict, Prisma 6.19, PostgreSQL 16, Zod 4, Vitest 4, Playwright 1.56, Geoapify HTTP APIs.

## Global Constraints

- Base every sub-PR on the latest merged `develop`.
- Read `AGENTS.md`, `docs/HANDOFF.md`, `docs/CODEX_IMPLEMENTATION_ORDER.md`, `docs/CODEX_PLACES_EXTENSION.md`, and `docs/CODEX_PHASE_F_METADATA_FIRST_DESIGN.md` before editing.
- Use `isPlacesEligibleTheme()` from `src/lib/places/eligibility.ts`; never copy theme strings.
- Never query `Collection` or `CollectionPost` for Places eligibility or statistics.
- Never accept or persist coordinates supplied by Claude, Codex, captions, or client requests.
- `UNKNOWN` creates no canonical `Place` row.
- The external Phase D API key stays read-only.
- No Phase G UI, Phase E worker, Phase H media analysis, Phase I globe, or Phase J MCP code.
- No PostGIS, Redis, new framework, or second authentication system.
- All code comments are in English.
- Every query and mutation is owner scoped.
- Every sub-PR stops for review before the next begins.

---

# Sub-PR F1 — Schema and domain contracts

Recommended branch:

```text
feat/places-domain-foundation
```

## Task 1: Add Places enums and Prisma relations

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_add_places_domain/migration.sql`
- Test: `tests/unit/places-domain-postgres.test.ts`

**Interfaces:**
- Consumes: existing `Post.id`, `Post.ownerId`, `Post.mainTheme`.
- Produces: Prisma models `Place`, `PostPlace`, `PlaceEvidence`, `PlaceAnalysisJob` and generated enum types.

- [ ] **Step 1: Write a failing PostgreSQL schema test**

Create `tests/unit/places-domain-postgres.test.ts` with the existing database-gated pattern:

```ts
// @vitest-environment node

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

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
  });

  afterAll(async () => {
    await resetDatabase();
    await prisma.$disconnect();
    process.env.DATABASE_URL = previousDatabaseUrl;
  });

  beforeEach(resetDatabase);

  it("deduplicates a provider place per owner", async () => {
    const data = {
      ownerId: OWNER_A,
      displayName: "Nobu Dubai",
      normalizedName: "nobu dubai",
      provider: "geoapify",
      providerPlaceId: "geo-1",
      latitude: 25.141,
      longitude: 55.186,
      precision: "EXACT" as const,
      confidence: 0.95,
    };

    await prisma.place.create({ data });
    await expect(prisma.place.create({ data })).rejects.toThrow();
    await expect(prisma.place.create({ data: { ...data, ownerId: OWNER_B } })).resolves.toBeDefined();
  });
});

async function resetDatabase(): Promise<void> {
  await prisma.post.deleteMany({ where: { ownerId: { in: [OWNER_A, OWNER_B] } } });
  await prisma.place.deleteMany({ where: { ownerId: { in: [OWNER_A, OWNER_B] } } });
}
```

- [ ] **Step 2: Run the test and verify it fails because `prisma.place` does not exist**

```bash
TEST_DATABASE_URL=<postgresql-16-url> npx vitest run tests/unit/places-domain-postgres.test.ts
```

Expected: TypeScript or runtime failure showing the Place model is missing.

- [ ] **Step 3: Add the enums and models from the signed design**

Modify `prisma/schema.prisma` using the exact model names and mapped table names in `docs/CODEX_PHASE_F_METADATA_FIRST_DESIGN.md` section 4. Add these relations to `Post`:

```prisma
placeLinks     PostPlace[]
placeEvidence  PlaceEvidence[]
placeJobs      PlaceAnalysisJob[]
```

Do not modify existing field semantics.

- [ ] **Step 4: Generate the migration**

```bash
npm run db:generate
npm run db:migrate -- --name add_places_domain
```

Review the generated SQL before continuing.

- [ ] **Step 5: Add invariant checks and the partial primary-place index**

Append idempotent SQL to the migration:

```sql
ALTER TABLE "places"
  ADD CONSTRAINT "places_latitude_check" CHECK ("latitude" BETWEEN -90 AND 90),
  ADD CONSTRAINT "places_longitude_check" CHECK ("longitude" BETWEEN -180 AND 180),
  ADD CONSTRAINT "places_confidence_check" CHECK ("confidence" BETWEEN 0 AND 1),
  ADD CONSTRAINT "places_approximation_radius_check" CHECK (
    ("precision" <> 'APPROXIMATE' AND "approximation_radius_meters" IS NULL)
    OR
    ("precision" = 'APPROXIMATE' AND "approximation_radius_meters" > 0)
  );

ALTER TABLE "post_places"
  ADD CONSTRAINT "post_places_confidence_check" CHECK ("confidence" BETWEEN 0 AND 1);

ALTER TABLE "place_evidence"
  ADD CONSTRAINT "place_evidence_confidence_check" CHECK ("confidence" BETWEEN 0 AND 1);

CREATE UNIQUE INDEX "post_places_one_primary_per_post"
  ON "post_places" ("owner_id", "post_id")
  WHERE "is_primary" = TRUE;
```

- [ ] **Step 6: Expand PostgreSQL tests**

Add tests proving:

```ts
it("rejects invalid coordinates", async () => {
  await expect(
    prisma.place.create({
      data: {
        ownerId: OWNER_A,
        displayName: "Invalid",
        normalizedName: "invalid",
        provider: "geoapify",
        providerPlaceId: "invalid",
        latitude: 91,
        longitude: 0,
        precision: "EXACT",
        confidence: 0.9,
      },
    }),
  ).rejects.toThrow();
});

it("requires a radius only for approximate places", async () => {
  await expect(
    prisma.place.create({
      data: {
        ownerId: OWNER_A,
        displayName: "Brussels",
        normalizedName: "brussels",
        provider: "geoapify",
        providerPlaceId: "brussels",
        latitude: 50.85,
        longitude: 4.35,
        precision: "APPROXIMATE",
        confidence: 0.7,
        approximationRadiusMeters: null,
      },
    }),
  ).rejects.toThrow();
});
```

Also prove owner scoping, one canonical link, one primary link, and cascade behavior.

- [ ] **Step 7: Run schema verification**

```bash
npm run db:generate
npm run typecheck
TEST_DATABASE_URL=<postgresql-16-url> npx vitest run tests/unit/places-domain-postgres.test.ts
```

Expected: all Places domain PostgreSQL tests pass.

- [ ] **Step 8: Commit**

```bash
git add prisma/schema.prisma prisma/migrations tests/unit/places-domain-postgres.test.ts
git commit -m "feat(places): add metadata-first domain schema"
```

## Task 2: Add candidate, resolver, and cursor contracts

**Files:**
- Create: `src/lib/places/candidates.ts`
- Create: `src/lib/places/cursor.ts`
- Create: `src/server/places/resolvers/types.ts`
- Create: `tests/unit/places-candidates.test.ts`
- Create: `tests/unit/places-cursor.test.ts`

**Interfaces:**
- Produces: `placeCandidateSchema`, `placeCandidateBatchSchema`, `PlaceCandidate`, `PlaceResolver`, `encodePlacesCursor`, `decodePlacesCursor`.

- [ ] **Step 1: Write failing candidate validation tests**

```ts
import { describe, expect, it } from "vitest";
import { placeCandidateSchema } from "@/lib/places/candidates";

describe("placeCandidateSchema", () => {
  it("accepts bounded textual evidence", () => {
    expect(placeCandidateSchema.parse({
      name: "Nobu Dubai",
      city: "Dubai",
      region: null,
      country: "United Arab Emirates",
      category: "restaurant",
      confidence: 0.9,
      evidence: [{ type: "CAPTION", excerpt: "Dinner at Nobu Dubai" }],
    })).toBeDefined();
  });

  it("rejects coordinates and provider identifiers", () => {
    expect(() => placeCandidateSchema.parse({
      name: "Nobu Dubai",
      city: "Dubai",
      region: null,
      country: "United Arab Emirates",
      category: "restaurant",
      confidence: 0.9,
      latitude: 25.14,
      providerPlaceId: "forbidden",
      evidence: [],
    })).toThrow();
  });
});
```

- [ ] **Step 2: Implement strict Zod schemas**

Use `.strict()`, bounded strings, `confidence` in `[0, 1]`, at most five candidates per post, at most eight evidence rows per candidate, and excerpts limited to 500 characters.

Export:

```ts
export const PLACE_CANDIDATE_CATEGORIES = [
  "restaurant",
  "lodging",
  "landmark",
  "city",
  "region",
  "other",
] as const;

export type PlaceCandidate = z.infer<typeof placeCandidateSchema>;
```

- [ ] **Step 3: Write and implement opaque cursor tests**

```ts
import { describe, expect, it } from "vitest";
import { decodePlacesCursor, encodePlacesCursor } from "@/lib/places/cursor";

it("round-trips a Places cursor", () => {
  const input = { updatedAt: new Date("2026-07-23T12:00:00.000Z"), id: "place-1" };
  expect(decodePlacesCursor(encodePlacesCursor(input))).toEqual(input);
});

it("rejects malformed cursors", () => {
  expect(() => decodePlacesCursor("not-a-cursor")).toThrow();
});
```

Implement base64url JSON encoding and strict Zod decoding.

- [ ] **Step 4: Add resolver interfaces**

Create the exact `PlaceResolutionInput`, `ResolvedPlaceCandidate`, and `PlaceResolver` interfaces from the signed design. No implementation imports Prisma.

- [ ] **Step 5: Run and commit**

```bash
npx vitest run tests/unit/places-candidates.test.ts tests/unit/places-cursor.test.ts
npm run typecheck
git add src/lib/places src/server/places/resolvers tests/unit/places-candidates.test.ts tests/unit/places-cursor.test.ts
git commit -m "feat(places): add candidate and resolver contracts"
```

## Task 3: Add job creation and repository foundations

**Files:**
- Create: `src/server/places/hash.ts`
- Create: `src/server/places/repository.ts`
- Create: `src/server/places/jobs.ts`
- Test: `tests/unit/places-jobs-postgres.test.ts`

**Interfaces:**
- Produces: `computePlacesInputHash()`, `createMetadataAnalysisJob()`, repository transaction helpers.

- [ ] **Step 1: Write a failing idempotency test**

```ts
it("creates one metadata job for the same owner, post, input, and version", async () => {
  const first = await jobs.createMetadataAnalysisJob({ ownerId: OWNER_A, postId: "travel-post" });
  const second = await jobs.createMetadataAnalysisJob({ ownerId: OWNER_A, postId: "travel-post" });
  expect(second.id).toBe(first.id);
});
```

Seed a `Voyages` post and a `Cuisine` post.

- [ ] **Step 2: Write a failing eligibility test**

```ts
await expect(
  jobs.createMetadataAnalysisJob({ ownerId: OWNER_A, postId: "cuisine-post" }),
).rejects.toMatchObject({ code: "POST_NOT_PLACES_ELIGIBLE" });
```

- [ ] **Step 3: Implement bounded input hashing**

`computePlacesInputHash()` must hash a stable JSON object containing:

```text
analysis version
post id
canonical source theme
caption
author username
sorted internal tags
bounded structured location metadata
verified media object keys and version tags when present
```

Use SHA-256 from `node:crypto`. Do not hash volatile timestamps.

- [ ] **Step 4: Implement job creation**

`createMetadataAnalysisJob()`:

1. loads the post by `id + ownerId`;
2. calls `isPlacesEligibleTheme()`;
3. canonicalizes `sourceTheme` using `PLACES_ELIGIBLE_THEMES`;
4. computes the input hash;
5. upserts or returns the existing idempotent job;
6. creates only `METADATA_ONLY` depth;
7. never reads a collection.

- [ ] **Step 5: Run and commit**

```bash
TEST_DATABASE_URL=<postgresql-16-url> npx vitest run tests/unit/places-jobs-postgres.test.ts
npm run lint
npm run typecheck
git add src/server/places tests/unit/places-jobs-postgres.test.ts
git commit -m "feat(places): add idempotent metadata jobs"
```

## F1 pull request gate

Before opening F1 PR:

```bash
npm run lint
npm run typecheck
TEST_DATABASE_URL=<postgresql-16-url> npm run test
npm run build
```

PR title:

```text
feat(places): Phase F1 — domain foundation
```

Do not start F2 until F1 is reviewed and merged.

---

# Sub-PR F2 — Geoapify, caption-only ingestion, scoring, persistence

Recommended branch:

```text
feat/places-caption-resolution
```

## Task 4: Implement deterministic scoring and continent mapping

**Files:**
- Create: `src/lib/places/scoring.ts`
- Create: `src/lib/places/continents.ts`
- Test: `tests/unit/places-scoring.test.ts`

**Interfaces:**
- Produces: `scoreResolvedCandidate()`, `continentCodeForCountry()`.

- [ ] **Step 1: Write table-driven scoring tests**

```ts
it.each([
  ["specific exact POI", specificResult(), { precision: "EXACT", radius: null }],
  ["ambiguous POI", ambiguousResult(), { precision: "PROBABLE", radius: null }],
  ["city only", cityResult(), { precision: "APPROXIMATE", radius: 25_000 }],
  ["country only", countryResult(), { precision: "UNKNOWN", radius: null }],
  ["contradiction", contradictoryResult(), { precision: "UNKNOWN", radius: null }],
])("classifies %s", (_name, input, expected) => {
  const result = scoreResolvedCandidate(input);
  expect(result.precision).toBe(expected.precision);
  expect(result.approximationRadiusMeters).toBe(expected.radius);
});
```

- [ ] **Step 2: Implement pure scoring**

Use named constants and return reasons. Never depend on provider coordinates for the confidence score. Clamp all scores to `[0, 1]`.

- [ ] **Step 3: Implement country-to-continent mapping**

Use a static, reviewed ISO-2 mapping. Return `null` for missing or unsupported country codes. Add tests for Belgium, Japan, Türkiye, United Arab Emirates, United States, and an invalid code.

- [ ] **Step 4: Run and commit**

```bash
npx vitest run tests/unit/places-scoring.test.ts
npm run typecheck
git add src/lib/places tests/unit/places-scoring.test.ts
git commit -m "feat(places): add deterministic resolution scoring"
```

## Task 5: Implement the Geoapify resolver

**Files:**
- Create: `src/server/places/resolvers/geoapify.ts`
- Create: `src/server/places/resolvers/index.ts`
- Test: `tests/unit/geoapify-resolver.test.ts`
- Modify: `.env.example`

**Interfaces:**
- Consumes: `PlaceResolver`.
- Produces: `GeoapifyPlaceResolver`, `getConfiguredPlaceResolver()`.

- [ ] **Step 1: Write request and response tests with an injected fetch mock**

```ts
it("encodes a structured geocoding request without leaking the key", async () => {
  const fetchMock = vi.fn().mockResolvedValue(jsonResponse(validGeoapifyResponse()));
  const resolver = new GeoapifyPlaceResolver({
    apiKey: "secret-key",
    baseUrl: "https://api.geoapify.com",
    fetchImpl: fetchMock,
    timeoutMs: 8_000,
    maxResults: 5,
  });

  await resolver.resolve({ candidate: restaurantCandidate(), sourceTheme: "Restaurant" });
  const requestUrl = String(fetchMock.mock.calls[0][0]);
  expect(requestUrl).toContain("/v1/geocode/search?");
  expect(requestUrl).toContain("name=Nobu+Dubai");
  expect(requestUrl).toContain("city=Dubai");
  expect(requestUrl).not.toContain("caption");
});
```

Add tests for invalid payload, timeout, one retry on 429/503, no retry on 400, max five results, and sanitized errors.

- [ ] **Step 2: Implement strict Geoapify response schemas**

Normalize only:

```text
place_id
name
formatted
city
state
country
country_code
lat
lon
result_type
rank confidence when present
attribution when present
```

Discard the raw feature after normalization.

- [ ] **Step 3: Implement bounded retry and timeout**

Retry once for `429`, `502`, `503`, or `504`. Use a short deterministic delay suitable for tests. Throw typed errors without including the API key, request URL, caption, or raw provider body.

- [ ] **Step 4: Implement configured resolver selection**

```ts
export function getConfiguredPlaceResolver(): PlaceResolver {
  const provider = process.env.PLACES_RESOLVER_PROVIDER?.trim() || "geoapify";
  if (provider !== "geoapify") throw new Error("UNSUPPORTED_PLACES_RESOLVER");
  return new GeoapifyPlaceResolver({
    apiKey: requireGeoapifyApiKey(),
    baseUrl: process.env.GEOAPIFY_API_BASE_URL || "https://api.geoapify.com",
    timeoutMs: parsePositiveInt(process.env.PLACES_RESOLVER_TIMEOUT_MS, 8_000),
    maxResults: parseBoundedInt(process.env.PLACES_RESOLVER_MAX_RESULTS, 5, 1, 5),
  });
}
```

- [ ] **Step 5: Document env values and commit**

```bash
npx vitest run tests/unit/geoapify-resolver.test.ts
npm run lint
npm run typecheck
git add src/server/places/resolvers tests/unit/geoapify-resolver.test.ts .env.example
git commit -m "feat(places): add Geoapify resolver"
```

## Task 6: Implement caption export and candidate import

**Files:**
- Create: `scripts/places/export-caption-batch.ts`
- Create: `scripts/places/import-candidate-batch.ts`
- Create: `src/server/places/caption-batch.ts`
- Create: `docs/places-caption-candidate.schema.json`
- Test: `tests/unit/places-caption-batch-postgres.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces npm scripts `places:export-captions` and `places:import-candidates`.

- [ ] **Step 1: Write exporter tests**

Prove the exporter:

- includes only posts for which `isPlacesEligibleTheme()` returns true;
- excludes captions already represented by a current successful input hash unless `--force` is used;
- writes bounded JSONL;
- never reads collections;
- never outputs media URLs or R2 credentials.

- [ ] **Step 2: Implement exporter service**

```ts
export type CaptionBatchRecord = {
  post_id: string;
  main_theme: "Voyages" | "Restaurant";
  caption: string;
  hashtags: string[];
  internal_tags: string[];
  author_username: string;
  instagram_location: string | null;
};
```

Cap caption length to the stored caption length but do not duplicate it in logs. Write one JSON object per line.

- [ ] **Step 3: Write importer dry-run and idempotency tests**

```ts
it("writes nothing in dry-run mode", async () => {
  const report = await importCandidateBatch({ input, ownerId: OWNER_A, commit: false });
  expect(report.resolved).toBeGreaterThan(0);
  expect(await prisma.place.count({ where: { ownerId: OWNER_A } })).toBe(0);
});

it("is idempotent when committed twice", async () => {
  await importCandidateBatch({ input, ownerId: OWNER_A, commit: true });
  await importCandidateBatch({ input, ownerId: OWNER_A, commit: true });
  expect(await prisma.place.count({ where: { ownerId: OWNER_A } })).toBe(1);
  expect(await prisma.postPlace.count({ where: { ownerId: OWNER_A } })).toBe(1);
});
```

Mock the resolver; do not call Geoapify in PostgreSQL tests.

- [ ] **Step 4: Implement CLI argument parsing with Zod**

Supported arguments:

```text
--input <path>
--output <path>
--limit <1..1000>
--post-id <id>
--commit
--continue-on-error
--force
```

Default importer mode is dry-run. Reject paths outside the current project or a configured temporary directory. Never use `eval` or shell interpolation.

- [ ] **Step 5: Add package scripts**

```json
{
  "places:export-captions": "tsx scripts/places/export-caption-batch.ts",
  "places:import-candidates": "tsx scripts/places/import-candidate-batch.ts"
}
```

- [ ] **Step 6: Commit**

```bash
TEST_DATABASE_URL=<postgresql-16-url> npx vitest run tests/unit/places-caption-batch-postgres.test.ts
npm run lint
npm run typecheck
git add scripts/places src/server/places/caption-batch.ts docs/places-caption-candidate.schema.json tests/unit/places-caption-batch-postgres.test.ts package.json
git commit -m "feat(places): add local caption candidate workflow"
```

## Task 7: Implement atomic analysis persistence

**Files:**
- Create: `src/server/places/analysis.ts`
- Expand: `src/server/places/repository.ts`
- Test: `tests/unit/places-analysis-postgres.test.ts`

**Interfaces:**
- Produces: `persistMetadataAnalysis()` and `analyzeCandidateBatchRecord()`.

- [ ] **Step 1: Write failing transaction tests**

Cover:

```text
resolved exact place
resolved approximate city
unknown with evidence only
multiple distinct places in one post
same place repeated in one post
stale theme cancellation
user-confirmed link protection
provider failure rollback
owner isolation
```

Example protection assertion:

```ts
it("does not overwrite a user-confirmed link", async () => {
  await seedConfirmedLink({ confidence: 1 });
  await analyzeCandidateBatchRecord({ ownerId: OWNER_A, record: lowerConfidenceRecord(), resolver });
  const link = await prisma.postPlace.findFirstOrThrow({ where: { ownerId: OWNER_A } });
  expect(link.isUserConfirmed).toBe(true);
  expect(link.confidence).toBe(1);
});
```

- [ ] **Step 2: Implement one-post atomic transaction**

The service must:

1. load owner-scoped post and job;
2. re-run `isPlacesEligibleTheme()`;
3. set `PROCESSING/RESOLVING`;
4. resolve candidates outside the write transaction when safe;
5. open one short Prisma transaction for domain writes;
6. upsert canonical places;
7. upsert one link per place;
8. insert bounded evidence;
9. write unresolved evidence with `placeId = null`;
10. finalize `SUCCEEDED` or `NEEDS_REVIEW`;
11. on failure, write only a bounded job error after the domain transaction has rolled back.

- [ ] **Step 3: Run and commit**

```bash
TEST_DATABASE_URL=<postgresql-16-url> npx vitest run tests/unit/places-analysis-postgres.test.ts
npm run lint
npm run typecheck
git add src/server/places tests/unit/places-analysis-postgres.test.ts
git commit -m "feat(places): persist metadata analysis atomically"
```

## F2 pull request gate

```bash
npm run lint
npm run typecheck
TEST_DATABASE_URL=<postgresql-16-url> npm run test
npm run build
```

Run a manual dry-run over 5–10 fixture posts. Do not send the full production library until the schema and importer PR is reviewed.

PR title:

```text
feat(places): Phase F2 — caption resolution and persistence
```

Do not start F3 until F2 is reviewed and merged.

---

# Sub-PR F3 — Read API, statistics, review services, final gate

Recommended branch:

```text
feat/places-api-stats-review
```

## Task 8: Implement owner-scoped queries and DTOs

**Files:**
- Create: `src/contracts/api/places.ts`
- Create: `src/server/places/queries.ts`
- Test: `tests/unit/places-queries-postgres.test.ts`

**Interfaces:**
- Produces: compact DTO types and query functions.

- [ ] **Step 1: Define DTOs**

Include:

```ts
export type PlaceListItemDto = {
  id: string;
  displayName: string;
  category: string | null;
  city: string | null;
  country: string | null;
  countryCode: string | null;
  continentCode: string | null;
  latitude: number;
  longitude: number;
  precision: "EXACT" | "PROBABLE" | "APPROXIMATE";
  confidence: number;
  approximationRadiusMeters: number | null;
  reviewStatus: "UNREVIEWED" | "CONFIRMED" | "REJECTED" | "CONFLICT";
  postCount: number;
  updatedAt: string;
};
```

List DTOs must not contain raw evidence excerpts, provider diagnostics, or job errors.

- [ ] **Step 2: Write pagination tests**

Prove stable ordering, no duplicate/skip across pages, malformed cursor rejection, and owner isolation.

- [ ] **Step 3: Implement query functions**

```ts
queryPlaces(input, ownerId)
getPlaceDetail(placeId, ownerId)
getPlacePosts(placeId, input, ownerId)
queryEligiblePosts(input, ownerId)
queryUnresolvedPlaceJobs(input, ownerId)
getPlaceAnalysisJob(jobId, ownerId)
```

Use Prisma projections; do not return full model graphs.

- [ ] **Step 4: Run and commit**

```bash
TEST_DATABASE_URL=<postgresql-16-url> npx vitest run tests/unit/places-queries-postgres.test.ts
npm run typecheck
git add src/contracts/api/places.ts src/server/places/queries.ts tests/unit/places-queries-postgres.test.ts
git commit -m "feat(places): add owner-scoped place queries"
```

## Task 9: Implement unique statistics

**Files:**
- Create: `src/server/places/stats.ts`
- Test: `tests/unit/places-stats-postgres.test.ts`

**Interfaces:**
- Produces: `getPlacesStats(filters, ownerId)`.

- [ ] **Step 1: Seed duplicate relationships and write failing tests**

Prove:

```text
one place linked to ten posts = one identified place and ten posts
same post with two places = two places and one distinct post
UNKNOWN job = review count only
REJECTED place excluded from identified totals
source_theme filter uses Post.mainTheme and eligible predicate semantics
country and continent counts are distinct
no CollectionPost join
```

- [ ] **Step 2: Implement aggregate queries**

Return:

```ts
{
  totals: {
    eligiblePosts: number;
    identifiedPlaces: number;
    countries: number;
    continents: number;
    postsWithPlaces: number;
    needsReview: number;
  };
  byTheme: Array<{ theme: "Voyages" | "Restaurant"; placeCount: number; postCount: number }>;
  byCountry: Array<{ countryCode: string; country: string | null; placeCount: number; postCount: number }>;
  byContinent: Array<{ continentCode: string; placeCount: number; countryCount: number; postCount: number }>;
}
```

Use SQL only inside `src/server`, parameterized through Prisma. Document any raw SQL and test it against PostgreSQL.

- [ ] **Step 3: Run and commit**

```bash
TEST_DATABASE_URL=<postgresql-16-url> npx vitest run tests/unit/places-stats-postgres.test.ts
npm run lint
npm run typecheck
git add src/server/places/stats.ts tests/unit/places-stats-postgres.test.ts
git commit -m "feat(places): add canonical place statistics"
```

## Task 10: Add read-only `/api/v1/places` routes

**Files:**
- Create: `src/app/api/v1/places/route.ts`
- Create: `src/app/api/v1/places/[id]/route.ts`
- Create: `src/app/api/v1/places/[id]/posts/route.ts`
- Create: `src/app/api/v1/places/stats/route.ts`
- Create: `src/app/api/v1/places/eligible-posts/route.ts`
- Create: `src/app/api/v1/places/unresolved/route.ts`
- Create: `src/app/api/v1/places/analysis-jobs/[id]/route.ts`
- Modify: `src/contracts/api/error.ts`
- Test: `tests/unit/api-v1-places.test.ts`

**Interfaces:**
- Consumes: Phase D auth/error helpers and Phase F query services.
- Produces: read-only HTTP contracts.

- [ ] **Step 1: Add typed domain errors**

Extend the stable mapping without exposing internals:

```text
POST_NOT_PLACES_ELIGIBLE -> BAD_REQUEST, 400
INVALID_CURSOR -> BAD_REQUEST, 400
PLACE_NOT_FOUND -> NOT_FOUND, 404
PLACE_JOB_NOT_FOUND -> NOT_FOUND, 404
PLACES_RESOLVER_NOT_CONFIGURED -> SERVICE_UNAVAILABLE, 503
```

Do not return raw error messages.

- [ ] **Step 2: Write route tests proving auth happens first**

```ts
it("authenticates before querying Places", async () => {
  process.env.EXTERNAL_API_KEY_SHA256 = hash("ipe_test");
  await GET(new Request("http://test/api/v1/places"));
  expect(queryPlacesMock).not.toHaveBeenCalled();
});
```

Also prove compact DTOs, filters, cursor, 404, and no write handlers.

- [ ] **Step 3: Implement thin routes**

Pattern:

```ts
export const runtime = "nodejs";

export async function GET(request: Request): Promise<NextResponse> {
  try {
    requireExternalApiKey(request);
    const input = parsePlacesListParams(new URL(request.url).searchParams);
    return externalApiJson(await queryPlaces(input, getConfiguredOwnerId()));
  } catch (error: unknown) {
    return externalApiErrorResponse(error);
  }
}
```

No route imports Prisma or Geoapify directly.

- [ ] **Step 4: Run and commit**

```bash
npx vitest run tests/unit/api-v1-places.test.ts
npm run lint
npm run typecheck
git add src/app/api/v1/places src/contracts/api tests/unit/api-v1-places.test.ts
git commit -m "feat(api): expose read-only Places endpoints"
```

## Task 11: Implement review and merge services

**Files:**
- Create: `src/server/places/review.ts`
- Test: `tests/unit/places-review-postgres.test.ts`

**Interfaces:**
- Produces: `confirmPlace()`, `rejectPlaceResult()`, `correctPostPlace()`, `mergePlaces()`.

- [ ] **Step 1: Write owner-isolation and protection tests**

Prove:

- owner B cannot confirm, reject, correct, or merge owner A data;
- confirm sets `isUserConfirmed` and `CONFIRMED`;
- automatic analysis cannot overwrite confirmed data;
- merge moves links and evidence, deduplicates links, preserves primary status deterministically, and deletes only the source place;
- merge transaction rolls back on an injected failure;
- rejection does not delete unrelated evidence or posts.

- [ ] **Step 2: Implement service-only mutations**

No `/api/v1` write route is created. Every method requires explicit `ownerId`, actor metadata, and a bounded reason string where applicable. Record user actions as `USER_CORRECTION` evidence.

- [ ] **Step 3: Run and commit**

```bash
TEST_DATABASE_URL=<postgresql-16-url> npx vitest run tests/unit/places-review-postgres.test.ts
npm run lint
npm run typecheck
git add src/server/places/review.ts tests/unit/places-review-postgres.test.ts
git commit -m "feat(places): add review and merge services"
```

## Task 12: Documentation, preflight, and final Phase F proof

**Files:**
- Modify: `.env.example`
- Modify: `scripts/vercel-preflight.mjs`
- Create: `docs/places-metadata-first.md`
- Modify after merge evidence only: `docs/HANDOFF.md`
- Modify after merge evidence only: `docs/IMPLEMENTATION_STATUS.md`

- [ ] **Step 1: Document the local workflow**

`docs/places-metadata-first.md` must include:

```text
Geoapify project and server key setup
caption export command
Claude Code command example
how to extract the JSON envelope result
candidate JSONL validation
import dry-run
import commit
failure recovery
attribution obligations
why OAuth credentials never enter the app
```

- [ ] **Step 2: Extend preflight safely**

`GEOAPIFY_API_KEY` is optional while Places is disabled. When `PLACES_ENABLED=1`, require a non-empty server key and supported provider. Never print the key.

- [ ] **Step 3: Run full verification**

```bash
npm run lint
npm run typecheck
TEST_DATABASE_URL=<postgresql-16-url> npm run test
npm run build
TEST_DATABASE_URL=<postgresql-16-url> npm run test:e2e
```

Record exact counts and failures. Do not state success without fresh output.

- [ ] **Step 4: Run a controlled pilot**

Export 30–50 eligible posts split between `Voyages` and `Restaurant`.

Record only aggregate evidence:

```text
posts exported
candidate extraction success
UNKNOWN count
Geoapify matched count
EXACT / PROBABLE / APPROXIMATE counts
provider failures
duplicates merged
manual corrections needed
average Geoapify calls per post
```

Do not commit caption files, candidate files, API keys, or production data.

- [ ] **Step 5: Update status only after all F sub-PRs are merged**

Set Phase F to `COMPLETE` only with merged PR numbers, commit SHAs, test counts, and pilot evidence. Mark Phase G `READY`. Phase H remains blocked until Phase E is complete.

- [ ] **Step 6: Commit final docs**

```bash
git add .env.example scripts/vercel-preflight.mjs docs/places-metadata-first.md
git commit -m "docs: record Phase F metadata-first workflow"
```

## F3 and final Phase F pull request gate

PR title:

```text
feat(places): Phase F3 — read API, statistics, and review
```

Required PR report:

```text
Phase active
Gate d’entrée vérifiée
Fichiers modifiés
Contrats ajoutés ou modifiés
Migrations
Tests ajoutés
Commandes exécutées
Résultats
Risques restants
Prochaine gate
```

The PR must explicitly confirm:

- no Phase G UI;
- no worker or VPS code;
- no OCR/video/FFmpeg code;
- no external write endpoint;
- no collection dependency;
- no model-generated coordinates;
- no committed caption/candidate files;
- no secret or OAuth credential stored in the app.

## Codex review checklist after each Claude PR

Codex must independently verify:

```text
requirements-to-files mapping
migration diff and destructive-operation scan
Prisma relation and index correctness
ownerId on every query and mutation
idempotency under duplicate execution
confirmed-data overwrite protection
UNKNOWN creates no Place
Geoapify key and caption absent from logs/errors
read-only external API boundary
test red-green evidence
full CI status
scope boundary to the active Phase F sub-PR
```

Codex approves only with fresh evidence. Otherwise it submits concrete requested changes with file and test references.
