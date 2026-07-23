# Implementation Status

Last updated: 23 July 2026

This file is a compact state ledger. Detailed scope, dependencies, and exit gates remain authoritative in `CODEX_IMPLEMENTATION_ORDER.md`.

Status values:

- `COMPLETE`: merged and supported by recorded proof;
- `READY`: entry gate is satisfied and the phase may start in a dedicated branch;
- `IN_PROGRESS`: active branch or pull request exists;
- `AWAITING_REVIEW`: implementation proof exists but the phase is not merged;
- `BLOCKED`: a required predecessor or decision is incomplete;
- `NOT_STARTED`: no implementation has begun, but the phase is not the next executable phase.

| Phase | Status | Dependencies | Branch / PR | Required or recorded evidence |
| --- | --- | --- | --- | --- |
| 0 — API and Places audit | COMPLETE | None | PR #15, merged into `develop` | Architecture, gaps, phase order, and Places eligibility documented. Documentation-only change. |
| A — Library filter consistency | COMPLETE | Phase 0 | PR #18, squash-merged into `develop` (`69ea0da`) | Shared predicates (`libraryPostWhere`, `relevanceFilter`) in `src/server/library.ts`; 16 PostgreSQL regressions in `tests/unit/library-filters-postgres.test.ts` (16/16 green against PostgreSQL 16); lint, typecheck, 129 tests, build all green. Two latent relevance-SQL type-binding defects fixed (make_date bigint, numeric cursor precision). Pre-existing `Browser tests` CI failure documented in PR #18 (red on `develop` since 14 July, identical 18-test list). |
| B — Places theme eligibility | COMPLETE | Phase A merged | PR #19, squash-merged into `develop` (`2323e0d`) | `PLACES_ELIGIBLE_THEMES` + `isPlacesEligibleTheme()` in `src/lib/places/eligibility.ts` reusing `foldForSearch()`; 8 unit tests in `tests/unit/places-eligibility.test.ts` covering exact positive and negative cases; no collection query; no index added; lint, typecheck, 137 tests, build all green. |
| E2e suite re-green (not a numbered phase) | COMPLETE | — | PR #21, squash-merged into `develop` (`1b5fa16`), closes issue #20 | Real CSS ribbon-overflow regression fixed in `globals.css` + library/toolbar e2e specs realigned with the mid-July UI. `develop` `Browser tests` CI green again (first time since 14 July 2026). Full Playwright suite: 65 passed / 13 skipped / 0 failed. |
| C — R2 media identity and worker isolation | COMPLETE | Reviewed design (PR #23) | PR #24, squash-merged into `develop` (`0870d69`) | Additive migration `20260723120000_add_media_identity_and_worker_role` (`MediaIdentity` enum + identity columns on `post_media` + `owner_id` backfill/NOT NULL + index + restricted `ipe_worker_reader` role); verified R2 identity persisted in the sync path (`src/server/media-identity.ts`); idempotent `backfillMediaIdentity`; `headR2Object` helper; worker credential docs; 6 PostgreSQL tests in `tests/unit/media-identity-postgres.test.ts`. lint, typecheck, 143 tests (with PG), build green in CI; migrate deploy + seed verified on a fresh DB. |
| D — External API V1 | AWAITING_REVIEW | Phase A merged | `claude/insta-saved-post-explorer-continue-wli2my` / PR #26 | `requireExternalApiKey` (Bearer SHA-256, timing-safe, fail-closed) in `src/auth/api-key.ts`; stable `{error:{code,message}}` contract in `src/contracts/api/error.ts`; six thin `/api/v1` adapters reusing server services; `EXTERNAL_API_KEY_SHA256` preflight validation; `docs/external-api.md`; 21 unit tests. Historical `/api/*` routes unchanged. lint, typecheck, 164 tests (with PG), build green; preflight ready. Deferred: distributed rate limiting (open decision). |
| E — Global worker foundation | BLOCKED | Phase C | None | Claim, lease, heartbeat, retry, cleanup, healthcheck, restricted DB and R2 access, no public port. |
| F — Places metadata-first domain | BLOCKED | Phases B, D, and relevant worker/data gates | None | Place models, verified resolution, human review, idempotent jobs, unique statistics, no collection dependency. |
| G — Places 2D UI and contextual navigation | BLOCKED | Phase F | None | `/places`, map, filters, clusters, review, statistics, post deep links, desktop and mobile navigation. |
| H — Deep Places analysis | BLOCKED | Phases C and E, stable Places domain | None | FFmpeg pipeline, OCR, transcription, multimodal escalation, prompt-injection tests, guaranteed cleanup, measured pilot. |
| I — Places 3D globe | BLOCKED | Phase G and stable Places data | None | Shared data source with 2D map, synchronized selection, fly-to, accessibility, mobile fallback. |
| J — Unified MCP and Hermes | BLOCKED | Phase D; Phase F for Places tools | None | One MCP server, shared API client, no DB or R2 access, confirmations for sensitive commands, one Hermes integration. |

## Current Execution Pointer

```text
Current state: Phases 0, A, B, C COMPLETE and merged (PRs #15, #18, #19, #24;
  Phase C design PR #23). E2e re-green merged (PR #21, closes issue #20).
develop CI green as of the Phase C merge (0870d69).
Phase D implementation AWAITING_REVIEW (PR #26).
Required stop: human review and merge of PR #26.
Next executable phase after merge: E (global worker, reuses ipe_worker_reader,
  depends on VPS decisions), and F/G become reachable once D is merged.
```

Do not change a phase to `COMPLETE` without adding its merged pull request and concrete validation evidence.
