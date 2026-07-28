# Places analysis JSON export - Intake

**Mode:** Critical
**Status:** Approved for implementation
**Date:** 2026-07-28

## Original request

Add a reusable, read-only command that exports every current owner-scoped Places
eligible post into one strict JSON document for manual ChatGPT caption analysis.
The command must target an explicitly configured develop or production database,
must never call Geoapify, AI, R2, media downloads, or write business data, and
must create `.tmp/places/places-analysis-input.json` atomically.

## Desired outcome

The operator runs one command, sends the resulting JSON to ChatGPT, receives the
existing strict candidate JSONL contract, dry-runs the existing importer, and
only then chooses whether to import with `--commit`.

## Existing-system evidence

- `src/server/places/caption-batch.ts` already owns caption export behavior.
- `loadAnalysisPostInputs` enforces owner-scoped post, tag, and media reads.
- `canonicalPlacesTheme` is the only eligibility canonicalizer.
- `computePlacesInputHash` and `PLACES_ANALYSIS_VERSION` define stale-input
  identity.
- `placeCandidateRecordSchema` remains the downstream JSONL contract.
- `.tmp/` and `*.jsonl` are already ignored.

## Brownfield baseline

The final rebased `origin/develop` is
`f74302b3bba6bf9bd29ab66d6ef8fbc32d5479b3`.
The principal checkout has unrelated local changes, including a modified
`package-lock.json` that overlaps remote changes. Work therefore continues in the
isolated `codex/places-analysis-json-export` worktree.

## Assumptions

- `APP_OWNER_ID` remains the default owner unless `--owner` is supplied.
- Explicit target variables are safer than inferring environment from hostname.
- A 10,000-record safety ceiling is sufficient for the current complete export.
- The existing candidate importer remains unchanged.

## Open questions

No product or architecture decision remains open. Actual production export is
environment-gated until an explicit production target variable is available.

## Risk classification

Critical because captions are sensitive user data, production may be read, the
file is intended for an external model, and the absence of writes or secrets is
a hard safety invariant.

## Scope routing decision

This is a Phase F metadata-first workflow extension. It does not activate Phase
E, start blocked Phase H, or alter Geoapify resolution, scoring, persistence, or
the public API.
