# Claude Code Prompt — Phase F1

Copy the prompt below into Claude Code after the Phase F design documentation is merged into `develop`.

---

You are working on:

```text
L1nK4R1M/insta-saved-post-explorer
```

Base branch:

```text
develop
```

Required Claude branch:

```text
claude/insta-saved-post-explorer-continue-wli2my
```

Reset the Claude branch from the latest `develop`. Do not continue from an older Claude branch state.

## Mission

Implement only:

```text
Phase F1 — Places schema and domain contracts
```

Follow:

```text
docs/CODEX_PHASE_F_METADATA_FIRST_DESIGN.md
docs/superpowers/plans/2026-07-23-phase-f-metadata-first.md
```

Do not implement F2 or F3 in this session.

## Mandatory reading order

Before editing, read:

```text
AGENTS.md
CLAUDE.md
docs/HANDOFF.md
docs/IMPLEMENTATION_STATUS.md
docs/CODEX_IMPLEMENTATION_ORDER.md
docs/CODEX_PLACES_EXTENSION.md
docs/CODEX_PHASE_F_METADATA_FIRST_DESIGN.md
docs/superpowers/plans/2026-07-23-phase-f-metadata-first.md
prisma/schema.prisma
src/lib/places/eligibility.ts
src/server/db.ts
tests/unit/media-identity-postgres.test.ts
```

Then inspect all files you plan to modify.

## Gate verification

Confirm in your work log before editing:

- Phase B is merged and `isPlacesEligibleTheme()` exists;
- Phase D is merged and the external API remains read-only;
- current `develop` CI is green;
- no Phase F implementation PR is already active;
- the Phase F design documentation is merged;
- you are starting from the latest `develop`;
- the only active sub-phase is F1.

Stop and report a conflict if any item is false.

## F1 scope

Implement only:

1. Places Prisma enums and models;
2. additive PostgreSQL migration and invariant checks;
3. relations from `Post` to the Places models;
4. strict textual candidate schemas;
5. `PlaceResolver` TypeScript interfaces only, without Geoapify implementation;
6. opaque Places cursor encode/decode utilities;
7. stable metadata input hashing;
8. idempotent `METADATA_ONLY` analysis-job creation;
9. PostgreSQL and unit tests for those foundations.

Expected primary files:

```text
prisma/schema.prisma
prisma/migrations/<timestamp>_add_places_domain/migration.sql
src/lib/places/candidates.ts
src/lib/places/cursor.ts
src/server/places/resolvers/types.ts
src/server/places/hash.ts
src/server/places/repository.ts
src/server/places/jobs.ts
tests/unit/places-domain-postgres.test.ts
tests/unit/places-candidates.test.ts
tests/unit/places-cursor.test.ts
tests/unit/places-jobs-postgres.test.ts
```

Adapt paths only when the existing repository structure requires it. Explain any deviation before editing.

## Non-negotiable rules

- Import `isPlacesEligibleTheme()`; never copy `Voyages` or `Restaurant` into service logic.
- Never consult `Collection` or `CollectionPost`.
- Candidate schemas must be strict and must reject coordinates, provider IDs and provider names.
- `UNKNOWN` is not a `PlacePrecision` enum value and never creates a Place row.
- All first-level Places tables carry `ownerId`.
- Every service query is owner scoped.
- One canonical `PostPlace` link per `(ownerId, postId, placeId)`.
- Repeated mentions are evidence rows, not duplicate links.
- The migration is additive and fix-forward.
- Add coordinate, confidence and approximation-radius check constraints.
- Add the partial unique index that permits one primary place per owner and post.
- Do not add PostGIS, Redis, map libraries, Geoapify calls, AI calls, worker code or UI.
- Do not add external write endpoints.
- Do not modify historical `/api/*` or `/api/v1` behavior.
- Do not store captions, JSONL candidate files, secrets, OAuth credentials or production data in Git.
- All code comments are in English.

## TDD sequence

Follow the F1 tasks in the implementation plan exactly:

```text
Task 1 — Prisma schema and migration
Task 2 — candidate, resolver and cursor contracts
Task 3 — job creation and repository foundations
```

For every task:

1. write the failing test;
2. run it and capture the expected failure;
3. implement the smallest correct change;
4. rerun the targeted test;
5. run lint and typecheck when the task is complete;
6. commit with a small descriptive commit;
7. continue only when the task evidence is green.

Do not claim red-green evidence without actual command output.

## Required behavior

### Place model

Canonical uniqueness:

```text
ownerId + provider + providerPlaceId
```

Checks:

```text
latitude in [-90, 90]
longitude in [-180, 180]
confidence in [0, 1]
APPROXIMATE requires a positive approximationRadiusMeters
non-APPROXIMATE requires approximationRadiusMeters = null
```

### PostPlace

- one row per canonical post/place pair;
- at most one `isPrimary = true` row per owner/post;
- owner-scoped indexes;
- explicit delete behavior.

### PlaceEvidence

- `placeId` is nullable;
- unresolved evidence can exist without a Place;
- bounded excerpt and metadata validation belongs in TypeScript contracts;
- no media URL, keyframe, audio or temporary-object field.

### PlaceAnalysisJob

- idempotency key: owner + post + input hash + analysis version;
- F1 creates only `METADATA_ONLY` jobs;
- source theme is canonical and loaded from the post;
- an ineligible post raises a typed `POST_NOT_PLACES_ELIGIBLE` domain error;
- input hash contains stable relevant input only and excludes volatile timestamps.

### Candidate schema

Accept only textual fields and bounded evidence. Reject unknown properties.

Forbidden:

```text
latitude
longitude
provider
providerPlaceId
precision
```

### Cursor

- base64url JSON;
- strict schema `{ updatedAt, id }`;
- malformed input raises a typed invalid-cursor error;
- no database or provider dependency.

## Required tests

At minimum prove:

- provider place deduplication per owner;
- same provider ID allowed for a different owner;
- invalid coordinates rejected by PostgreSQL;
- invalid confidence rejected;
- approximate radius invariant enforced;
- one primary place per post enforced;
- one canonical post-place link enforced;
- post deletion cascades as designed;
- strict candidate schema accepts valid text and rejects coordinate/provider fields;
- cursor round-trip and malformed-cursor rejection;
- eligible post creates an idempotent metadata job;
- `Voyages` and `Restaurant` use the shared eligibility predicate;
- non-eligible post is rejected;
- owner B cannot create/read owner A job through repository services;
- no collection query is introduced.

Use the existing `TEST_DATABASE_URL` PostgreSQL 16 test pattern. Do not rely only on mocks for schema and ownership behavior.

## Required verification

Run:

```bash
npm run db:generate
npm run lint
npm run typecheck
TEST_DATABASE_URL=<postgresql-16-url> npm run test
npm run build
```

Also verify the migration on a fresh PostgreSQL 16 database:

```bash
DATABASE_URL=<fresh-postgresql-16-url> npm run db:deploy
DATABASE_URL=<fresh-postgresql-16-url> npm run db:seed
```

Do not run or expose production credentials.

## Commits

Recommended commits:

```text
test(places): cover metadata-first domain invariants
feat(places): add metadata-first domain schema
feat(places): add candidate and cursor contracts
feat(places): add idempotent metadata jobs
```

Use fewer commits only when the changes are genuinely inseparable.

## Pull request

Open a PR to `develop`.

Title:

```text
feat(places): Phase F1 — domain foundation
```

PR report must contain:

```text
Phase active
Sub-phase active
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

Explicitly confirm:

- F2 was not started;
- F3 was not started;
- no Geoapify call was implemented;
- no worker/VPS code;
- no UI/map code;
- no video/OCR/AI code;
- no external write route;
- no collection dependency;
- no coordinates accepted from candidates;
- no secrets or data files committed.

Stop after opening the F1 PR. Do not merge it yourself and do not start F2.

## Final response format

Return:

```text
Phase active
Sub-phase active
Initial audit
Files changed
Migration summary
Contracts added
Tests added
Red-green evidence
Commands and exact results
Scope exclusions verified
Risks remaining
Pull request
Next allowed action
```

For `Next allowed action`, state only:

```text
Codex review of F1. F2 remains blocked until F1 is reviewed and merged.
```
