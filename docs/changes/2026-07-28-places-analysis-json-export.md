# Places complete analysis JSON export

Date: 28 July 2026
Branch: `codex/places-analysis-json-export`
Base: `f74302b3bba6bf9bd29ab66d6ef8fbc32d5479b3`
Pull request: `#46`
Status: tool verified; production environment required

## Scope

Add a reusable target-explicit, read-only command that exports complete current
Places caption inputs into one strict JSON file for manual ChatGPT analysis.
Existing candidate JSONL import, Geoapify resolution, scoring, persistence,
worker behavior, API contracts, and Prisma schema remain unchanged.

## Design

- compose the new document over the existing `exportCaptionBatch` boundary;
- keep `loadAnalysisPostInputs`, `canonicalPlacesTheme`, and
  `computePlacesInputHash` authoritative;
- paginate the owner-scoped post scan and fail rather than truncate above 10,000
  eligible records;
- validate a strict Zod v2 document before atomic rename;
- confine output physically and lexically to repository `.tmp`;
- select only `PLACES_DEVELOP_DATABASE_URL` or
  `PLACES_PRODUCTION_DATABASE_URL`, never ambient `DATABASE_URL`.

## Test files

- `tests/unit/places-analysis-json-export.test.ts`: necessary to protect the new
  strict file/CLI contract and its traversal, symlink, atomicity, cleanup,
  partition, redaction, and target-selection risks without browser or database
  overhead.
- `tests/unit/places-caption-batch-postgres.test.ts`: existing file extended to
  prove real owner scope, deterministic order, source fidelity, and unchanged
  business-table counts at the PostgreSQL seam when `TEST_DATABASE_URL` exists.

## Verification status

- focused unit exporter: 32 tests passed;
- focused exporter plus neighboring Places contracts: 45 tests passed;
- focused PostgreSQL exporter: 13 tests discovered and skipped because
  `TEST_DATABASE_URL` is absent;
- Prisma client generation: passed;
- lint: passed;
- typecheck: passed after Prisma generation;
- full tests: 361 passed, 130 environment-bound skips;
- production build: passed, 32 pages;
- `git diff --check`: passed;
- real production export: pending explicit
  `PLACES_PRODUCTION_DATABASE_URL`; no file has been fabricated.

## Security and data handling

No migration, database write, Geoapify call, AI call, R2 read, or media download
is introduced. Captions are written only to the ignored requested artifact and
never logged. Unknown record fields, including coordinates and provider fields,
are rejected.

## Rollback

Revert the feature commit or stop using the command. No database rollback is
required because the operation is read-only.
