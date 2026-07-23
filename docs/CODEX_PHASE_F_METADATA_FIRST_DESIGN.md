# CODEX_PHASE_F_METADATA_FIRST_DESIGN.md

> Phase F design — Places metadata-first domain.
> This document becomes authoritative only after review and merge into `develop`.
> It authorizes Phase F only. It does not authorize Phase E, G, H, I, or J.

## 1. Goal and authority

Build the persistent Places domain for posts whose `Post.mainTheme` is accepted by the already merged `isPlacesEligibleTheme()` predicate.

Authority order:

1. `AGENTS.md`;
2. `docs/HANDOFF.md`;
3. `docs/CODEX_IMPLEMENTATION_ORDER.md`, Phase F;
4. `docs/CODEX_PLACES_EXTENSION.md`;
5. this design;
6. repository code and existing conventions.

Phase F depends on Phases B and D. Both are merged. Phase F does not require the VPS worker from Phase E because this design includes a temporary local caption-only workflow.

## 2. Scope

### Included

- Prisma models and additive migration for `Place`, `PostPlace`, `PlaceEvidence`, and `PlaceAnalysisJob`;
- owner-scoped server services;
- candidate schemas that never contain model-generated coordinates;
- a replaceable `PlaceResolver` interface;
- Geoapify as the Phase F geographic resolver;
- deterministic scoring and precision classification;
- metadata-only analysis from captions, hashtags, author text, and existing structured metadata;
- local JSONL export/import workflow usable with Claude Code or Codex CLI before the VPS exists;
- read-only `/api/v1/places*` endpoints using the existing external API key;
- statistics by theme, country, and continent;
- human-review service methods and audit-safe persistence;
- PostgreSQL, unit, API, and migration tests.

### Explicitly excluded

- global worker process, claim loop, Docker deployment, and VPS provisioning — Phase E;
- `/places` UI, map, clusters, contextual post buttons — Phase G;
- FFmpeg, OCR, transcription, or multimodal video analysis — Phase H;
- Mapbox or another 2D/3D renderer — Phases G and I;
- MCP and Hermes tools — Phase J;
- exposing write operations through the existing read-only external API key;
- storing Claude Code or Codex OAuth credentials in Vercel, PostgreSQL, or the repository.

## 3. Signed design decisions for the Phase F implementation PR

These decisions are proposed by Codex for owner review. Merging this document signs them off.

### D1 — Geographic resolver: Geoapify

Use Geoapify server-side through a replaceable adapter:

```text
candidate text
  -> Geoapify Geocoding API
  -> optional Geoapify Places lookup for a named POI in a resolved locality
  -> optional Place Details lookup for the selected place_id
  -> normalized verified result
```

Environment variables:

```dotenv
GEOAPIFY_API_KEY=
GEOAPIFY_API_BASE_URL=https://api.geoapify.com
PLACES_RESOLVER_PROVIDER=geoapify
PLACES_RESOLVER_TIMEOUT_MS=8000
PLACES_RESOLVER_MAX_RESULTS=5
```

Rules:

- the key is server-only and must never use a `NEXT_PUBLIC_` prefix;
- every persisted provider result stores `provider = "geoapify"` and its `place_id`;
- provider attribution is retained in metadata for the future Phase G UI;
- raw provider payloads are not persisted; store only bounded normalized fields and limited diagnostics;
- provider failures must not create a Place row.

### D2 — AI or CLI extracts candidates, never coordinates

The model-facing contract contains only textual candidates and textual evidence:

```ts
export type PlaceCandidate = {
  name: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  category: "restaurant" | "lodging" | "landmark" | "city" | "region" | "other";
  confidence: number;
  evidence: Array<{
    type: "CAPTION" | "HASHTAG" | "AUTHOR_TEXT" | "INSTAGRAM_LOCATION";
    excerpt: string;
  }>;
};
```

Forbidden candidate fields:

```text
latitude
longitude
providerPlaceId
provider
precision
```

Only `PlaceResolver` may return coordinates and a provider identifier.

### D3 — Temporary caption-only workflow without VPS

Phase F adds two local scripts:

```text
scripts/places/export-caption-batch.ts
scripts/places/import-candidate-batch.ts
```

Workflow:

```text
PostgreSQL eligible posts
  -> export bounded JSONL
  -> Claude Code or Codex CLI produces candidate JSONL
  -> strict Zod validation
  -> Geoapify resolution
  -> deterministic scoring
  -> atomic persistence
```

The export contains only the minimum required fields:

```text
post_id
main_theme
caption
hashtags
internal_tags
author_username
instagram_location when already present
```

The local model command is external to the application. No application service spawns `claude`, `codex`, a shell, or an OAuth flow. The repository may document an example command, but application code only reads and validates JSONL.

### D4 — Precision semantics

`UNKNOWN` is an analysis outcome, not a `Place` row.

- `EXACT`: a specific POI, establishment, building, monument, street address, or equivalent provider result; provider verified; deterministic score at least `0.90`; no major contradiction.
- `PROBABLE`: a provider-verified specific result with incomplete or ambiguous context; score at least `0.75`.
- `APPROXIMATE`: a provider-verified city, district, county, state, or region; score at least `0.50`; `approximationRadiusMeters` is mandatory.
- `UNKNOWN`: no safe provider match, a country-only match, contradictory evidence, or score below `0.50`; no canonical Place and no map point.

Initial approximation radii:

```text
district/suburb  5,000 m
city             25,000 m
county            50,000 m
state/region     150,000 m
```

A country-only result becomes `UNKNOWN` in Phase F.

### D5 — One canonical link per post and place

`PostPlace` stores one row per `(ownerId, postId, placeId)`. Multiple mentions or excerpts of the same place live in `PlaceEvidence`, not duplicate `PostPlace` rows.

This makes statistics deterministic and prevents a repeated caption mention from multiplying post counts.

### D6 — Cursor pagination

Places list endpoints use opaque cursor pagination. The default ordering is:

```text
updatedAt DESC, id DESC
```

The cursor encodes only:

```json
{"updatedAt":"2026-07-23T12:00:00.000Z","id":"place_id"}
```

The cursor must be base64url encoded, Zod validated, owner scoped, and rejected with `BAD_REQUEST` when malformed.

### D7 — External writes remain blocked

The Phase D external API key remains read-only.

Phase F exposes read routes under `/api/v1/places*`. Mutation services exist and are tested, but they are invoked only by:

- local Phase F scripts;
- future authenticated admin UI routes in Phase G;
- future scoped MCP commands in Phase J.

Do not expose confirm, correct, merge, reject, or batch analysis to the current read-only Bearer key.

### D8 — Split Phase F into three reviewable pull requests

Do not implement Phase F as one oversized PR.

```text
F1 — schema and domain contracts
F2 — resolver, caption-only ingestion, scoring, persistence
F3 — read API, statistics, review services, documentation and final gate
```

Only one Phase F sub-PR may be active at a time. Each starts from the latest merged `develop` and stops for review.

## 4. Target data model

### 4.1 Enums

```prisma
enum PlacePrecision {
  EXACT
  PROBABLE
  APPROXIMATE
}

enum PlaceReviewStatus {
  UNREVIEWED
  CONFIRMED
  REJECTED
  CONFLICT
}

enum PlaceEvidenceType {
  INSTAGRAM_LOCATION
  CAPTION
  HASHTAG
  AUTHOR_TEXT
  PROVIDER_MATCH
  USER_CORRECTION
}

enum PlaceAnalysisStatus {
  PENDING
  PROCESSING
  SUCCEEDED
  NEEDS_REVIEW
  FAILED
  CANCELLED
}

enum PlaceAnalysisStage {
  QUEUED
  EXTRACTING
  RESOLVING
  PERSISTING
  COMPLETE
}

enum PlaceAnalysisDepth {
  METADATA_ONLY
  AUTO
  DEEP
}
```

Phase F creates only `METADATA_ONLY` jobs. `AUTO` and `DEEP` are reserved for later phases and must be rejected by the Phase F execution service.

### 4.2 Place

```prisma
model Place {
  id                        String            @id @default(cuid())
  ownerId                   String            @map("owner_id")
  displayName               String            @map("display_name")
  normalizedName            String            @map("normalized_name")
  category                  String?
  provider                  String
  providerPlaceId           String            @map("provider_place_id")
  address                   String?
  city                      String?
  region                    String?
  country                   String?
  countryCode               String?           @map("country_code")
  continentCode             String?           @map("continent_code")
  latitude                  Float
  longitude                 Float
  precision                 PlacePrecision
  confidence                Float
  approximationRadiusMeters Int?              @map("approximation_radius_meters")
  reviewStatus              PlaceReviewStatus @default(UNREVIEWED) @map("review_status")
  isUserConfirmed           Boolean           @default(false) @map("is_user_confirmed")
  metadata                  Json              @default("{}")
  createdAt                 DateTime          @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt                 DateTime          @updatedAt @map("updated_at") @db.Timestamptz(3)
  postLinks                 PostPlace[]
  evidence                  PlaceEvidence[]

  @@unique([ownerId, provider, providerPlaceId], map: "places_owner_provider_id_key")
  @@index([ownerId, updatedAt, id], map: "places_owner_updated_id_idx")
  @@index([ownerId, countryCode], map: "places_owner_country_idx")
  @@index([ownerId, continentCode], map: "places_owner_continent_idx")
  @@index([ownerId, reviewStatus], map: "places_owner_review_idx")
  @@map("places")
}
```

The SQL migration adds checks for latitude, longitude, confidence, and approximate radius.

### 4.3 PostPlace

```prisma
model PostPlace {
  id              String          @id @default(cuid())
  ownerId         String          @map("owner_id")
  postId          String          @map("post_id")
  placeId         String          @map("place_id")
  analysisJobId   String?         @map("analysis_job_id")
  isPrimary       Boolean         @default(false) @map("is_primary")
  precision       PlacePrecision
  confidence      Float
  isUserConfirmed Boolean         @default(false) @map("is_user_confirmed")
  createdAt       DateTime        @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt       DateTime        @updatedAt @map("updated_at") @db.Timestamptz(3)
  post            Post            @relation(fields: [postId], references: [id], onDelete: Cascade)
  place           Place           @relation(fields: [placeId], references: [id], onDelete: Cascade)
  analysisJob     PlaceAnalysisJob? @relation(fields: [analysisJobId], references: [id], onDelete: SetNull)

  @@unique([ownerId, postId, placeId], map: "post_places_owner_post_place_key")
  @@index([ownerId, postId], map: "post_places_owner_post_idx")
  @@index([ownerId, placeId], map: "post_places_owner_place_idx")
  @@map("post_places")
}
```

The SQL migration adds a partial unique index allowing at most one primary link per owner and post.

### 4.4 PlaceEvidence

`placeId` is nullable so unresolved evidence can be retained without fabricating a Place.

```prisma
model PlaceEvidence {
  id                String            @id @default(cuid())
  ownerId           String            @map("owner_id")
  postId            String            @map("post_id")
  placeId           String?           @map("place_id")
  analysisJobId     String            @map("analysis_job_id")
  evidenceType      PlaceEvidenceType @map("evidence_type")
  normalizedValue   String?           @map("normalized_value")
  excerpt           String?           @db.Text
  videoTimestampMs  Int?              @map("video_timestamp_ms")
  confidence        Float
  metadata          Json              @default("{}")
  createdAt         DateTime          @default(now()) @map("created_at") @db.Timestamptz(3)
  post              Post              @relation(fields: [postId], references: [id], onDelete: Cascade)
  place             Place?            @relation(fields: [placeId], references: [id], onDelete: SetNull)
  analysisJob       PlaceAnalysisJob  @relation(fields: [analysisJobId], references: [id], onDelete: Cascade)

  @@index([ownerId, postId], map: "place_evidence_owner_post_idx")
  @@index([ownerId, analysisJobId], map: "place_evidence_owner_job_idx")
  @@map("place_evidence")
}
```

### 4.5 PlaceAnalysisJob

```prisma
model PlaceAnalysisJob {
  id             String                 @id @default(cuid())
  ownerId        String                 @map("owner_id")
  postId         String                 @map("post_id")
  sourceTheme    String                 @map("source_theme")
  depth          PlaceAnalysisDepth     @default(METADATA_ONLY)
  status         PlaceAnalysisStatus    @default(PENDING)
  stage          PlaceAnalysisStage     @default(QUEUED)
  priority       Int                    @default(0)
  analysisVersion String                @map("analysis_version")
  inputHash      String                 @map("input_hash")
  attemptCount   Int                    @default(0) @map("attempt_count")
  maxAttempts    Int                    @default(3) @map("max_attempts")
  leaseOwner     String?                @map("lease_owner")
  leaseExpiresAt DateTime?              @map("lease_expires_at") @db.Timestamptz(3)
  heartbeatAt    DateTime?              @map("heartbeat_at") @db.Timestamptz(3)
  result         Json?
  errorCode      String?                @map("error_code")
  errorMessage   String?                @map("error_message")
  startedAt      DateTime?              @map("started_at") @db.Timestamptz(3)
  completedAt    DateTime?              @map("completed_at") @db.Timestamptz(3)
  createdAt      DateTime               @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt      DateTime               @updatedAt @map("updated_at") @db.Timestamptz(3)
  post           Post                   @relation(fields: [postId], references: [id], onDelete: Cascade)
  postLinks      PostPlace[]
  evidence       PlaceEvidence[]

  @@unique([ownerId, postId, inputHash, analysisVersion], map: "place_jobs_idempotency_key")
  @@index([ownerId, status, priority, createdAt], map: "place_jobs_owner_status_priority_idx")
  @@index([ownerId, postId, createdAt], map: "place_jobs_owner_post_created_idx")
  @@map("place_analysis_jobs")
}
```

Add the corresponding relations to `Post`.

## 5. Resolver contract

```ts
export type PlaceResolutionInput = {
  candidate: PlaceCandidate;
  sourceTheme: "Voyages" | "Restaurant";
};

export type ResolvedPlaceCandidate = {
  provider: "geoapify";
  providerPlaceId: string;
  displayName: string;
  category: string | null;
  address: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  countryCode: string | null;
  latitude: number;
  longitude: number;
  providerResultType: string | null;
  providerRank: number | null;
  attribution: string | null;
};

export interface PlaceResolver {
  resolve(input: PlaceResolutionInput): Promise<ResolvedPlaceCandidate[]>;
}
```

Implementation paths:

```text
src/server/places/resolvers/types.ts
src/server/places/resolvers/geoapify.ts
src/server/places/resolvers/index.ts
```

The Geoapify adapter must:

- use `fetch` with an abort timeout;
- send at most five results per candidate;
- encode all query parameters with `URLSearchParams`;
- validate responses with Zod;
- reject non-HTTPS base URLs outside tests;
- retry only `429`, `502`, `503`, and `504`, at most once;
- never log the API key or full caption;
- support dependency injection of `fetch` for unit tests.

## 6. Deterministic scoring

Create pure functions under:

```text
src/lib/places/scoring.ts
src/lib/places/continents.ts
src/lib/places/candidates.ts
```

Scoring inputs:

- candidate confidence;
- exact normalized name match;
- city match;
- region match;
- country match;
- provider result type;
- category compatibility;
- contradictory fields.

Scoring outputs:

```ts
export type ScoredResolution = {
  confidence: number;
  precision: "EXACT" | "PROBABLE" | "APPROXIMATE" | "UNKNOWN";
  approximationRadiusMeters: number | null;
  reasons: string[];
};
```

The score is clamped to `[0, 1]`. `EXACT` additionally requires a provider-verified specific result type and no contradiction. A country-only result is always `UNKNOWN` regardless of score.

## 7. Atomic persistence

Primary service path:

```text
src/server/places/analysis.ts
src/server/places/repository.ts
src/server/places/queries.ts
src/server/places/review.ts
```

`persistMetadataAnalysis()` runs one Prisma transaction:

1. reload and owner-scope the post;
2. call `isPlacesEligibleTheme()`;
3. reject an ineligible or stale automatic job;
4. upsert canonical Place rows by `(ownerId, provider, providerPlaceId)`;
5. upsert one `PostPlace` per canonical place;
6. insert bounded evidence rows;
7. persist unresolved evidence with `placeId = null` when needed;
8. update job result and status;
9. never overwrite a user-confirmed Place or PostPlace with automatic data;
10. rollback all domain writes when any step fails.

## 8. Read API

Phase F read routes:

```text
GET /api/v1/places
GET /api/v1/places/[id]
GET /api/v1/places/[id]/posts
GET /api/v1/places/stats
GET /api/v1/places/eligible-posts
GET /api/v1/places/unresolved
GET /api/v1/places/analysis-jobs/[id]
```

All routes:

- call `requireExternalApiKey()`;
- call one owner-scoped server service;
- use `externalApiJson()` and `externalApiErrorResponse()`;
- never import Prisma directly;
- remain read-only;
- return compact DTOs and cursor metadata.

`nearby` is deferred until Phase G because it requires a defined distance and bounding-box UX contract. It must not be improvised in Phase F.

## 9. Temporary Claude/Codex caption workflow

Export command to implement:

```bash
npm run places:export-captions -- --limit 100 --output .tmp/places/captions.jsonl
```

Example external Claude Code command:

```bash
cat .tmp/places/captions.jsonl | claude -p \
  --output-format json \
  --max-turns 1 \
  "Return only candidate JSONL matching docs/places-caption-candidate.schema.json. Never return coordinates."
```

The JSON envelope emitted by `--output-format json` contains the model result as text. A small local helper may extract `.result`, but it must still validate every JSONL line with Zod before import.

Import command:

```bash
npm run places:import-candidates -- --input .tmp/places/candidates.jsonl
```

The importer must support:

```text
--dry-run
--limit
--post-id
--continue-on-error
```

Defaults:

- dry-run unless `--commit` is present;
- one post transaction at a time;
- bounded evidence excerpt length;
- no caption written to logs;
- summary counts only.

## 10. Migration policy

- additive migration only;
- no existing column drop or type change;
- all foreign keys use explicit delete behavior;
- add SQL checks for coordinate, confidence, and approximate radius invariants;
- add the partial unique primary-place index;
- no PostGIS dependency in Phase F;
- recovery is fix-forward with Neon branch/PITR safety;
- migration and seed must run successfully on a fresh PostgreSQL 16 database.

## 11. Required tests

### F1 schema and repository

- migration applies on a fresh database;
- owner isolation on every table;
- provider identity deduplicates canonical places;
- one post-place link per canonical place;
- only one primary place per post;
- `UNKNOWN` persists no Place row;
- check constraints reject invalid coordinates/confidence/radius;
- deleting a post cascades links, evidence, and jobs as designed.

### F2 resolver and caption ingestion

- candidate schema rejects coordinates and provider identifiers;
- Geoapify URL and parameters are encoded correctly;
- response normalization is bounded and typed;
- timeout, 429 retry, 5xx retry, and non-retryable 4xx behavior;
- no API key or caption appears in errors/logs;
- deterministic scoring covers exact, probable, approximate, contradiction, and country-only unknown;
- JSONL exporter selects only `Voyages` and `Restaurant` through `isPlacesEligibleTheme()`;
- importer dry-run writes nothing;
- importer commit is idempotent;
- stale theme cancels an automatic job;
- user-confirmed data is never overwritten.

### F3 API, statistics, and review

- every route authenticates before service access;
- cursor validation and pagination stability;
- source theme filter accepts only canonical eligible themes;
- statistics count distinct canonical places and distinct posts;
- `UNKNOWN` is excluded from identified-place totals and included in review totals;
- country and continent aggregations are deterministic;
- external API exposes no write operation;
- review services confirm, reject, correct, and merge without crossing owner boundaries;
- merge preserves evidence and post links and removes duplicates transactionally.

Full verification for each sub-PR:

```bash
npm run lint
npm run typecheck
TEST_DATABASE_URL=<postgresql-16-url> npm run test
npm run build
```

The final F3 PR also runs the full Playwright suite to prove no library regression.

## 12. Agent ownership

### Claude Code

Claude owns implementation on the required Claude branch. It executes one Phase F sub-PR at a time, writes code and tests, runs the red-green cycle, and opens each PR for review.

### Codex

Codex does not edit Claude's active implementation branch. Codex:

- audits each PR diff against this design and `CODEX_PLACES_EXTENSION.md`;
- checks migration safety and Prisma relation correctness;
- checks owner isolation, idempotency, and auth boundaries;
- checks that tests prove the requirements rather than mirror the implementation;
- checks CI and Vercel evidence;
- requests changes or approves;
- updates handoff/status only after merge evidence exists.

## 13. Phase F exit gate

Phase F is complete only after F1, F2, and F3 are merged and documented, with proof that:

- Places eligibility uses only `isPlacesEligibleTheme()`;
- Geoapify is behind `PlaceResolver`;
- models never supply coordinates;
- `UNKNOWN` creates no Place;
- owner isolation and idempotency are tested on PostgreSQL;
- local caption-only analysis works without VPS or application-stored OAuth credentials;
- external `/api/v1` remains read-only;
- statistics count canonical places and distinct posts correctly;
- user-confirmed data is protected;
- lint, typecheck, PostgreSQL tests, build, and final e2e checks pass.

After the gate is reviewed, Phase G may start. Phase H still requires Phases C and E plus a stable Places domain.
