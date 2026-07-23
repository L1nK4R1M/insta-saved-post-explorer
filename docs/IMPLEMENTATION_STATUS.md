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
| C — R2 media identity and worker isolation | READY | Separate reviewed design (satisfied) | `CODEX_R2_WORKER_ISOLATION_DESIGN.md` (design), implementation branch TBD | Reviewed design merged with owner decisions D1–D4 signed off. Implementation must add: additive migration (identity columns + `MediaIdentity` enum + index + restricted role), R2 identity persisted in the sync path, `ownerId` denormalization, idempotent identity backfill, worker R2 credential docs, owner-isolation and role-permission tests. |
| D — External API V1 | BLOCKED | Phase A and prerequisites in implementation order | None | Authenticated read-only `/api/v1`; stable errors; reused server services; route regressions; deployment preflight. |
| E — Global worker foundation | BLOCKED | Phase C | None | Claim, lease, heartbeat, retry, cleanup, healthcheck, restricted DB and R2 access, no public port. |
| F — Places metadata-first domain | BLOCKED | Phases B, D, and relevant worker/data gates | None | Place models, verified resolution, human review, idempotent jobs, unique statistics, no collection dependency. |
| G — Places 2D UI and contextual navigation | BLOCKED | Phase F | None | `/places`, map, filters, clusters, review, statistics, post deep links, desktop and mobile navigation. |
| H — Deep Places analysis | BLOCKED | Phases C and E, stable Places domain | None | FFmpeg pipeline, OCR, transcription, multimodal escalation, prompt-injection tests, guaranteed cleanup, measured pilot. |
| I — Places 3D globe | BLOCKED | Phase G and stable Places data | None | Shared data source with 2D map, synchronized selection, fly-to, accessibility, mobile fallback. |
| J — Unified MCP and Hermes | BLOCKED | Phase D; Phase F for Places tools | None | One MCP server, shared API client, no DB or R2 access, confirmations for sensitive commands, one Hermes integration. |

## Current Execution Pointer

```text
Current state: Phases 0, A, B COMPLETE and merged (PRs #15, #18, #19).
E2e re-green chantier COMPLETE and merged (PR #21, closes issue #20).
develop CI fully green as of 1b5fa16 (Browser tests included).
Phase C design reviewed and signed off (CODEX_R2_WORKER_ISOLATION_DESIGN.md,
  decisions D1–D4) → Phase C is READY.
No implementation phase is active (no Phase C code written yet).
Next executable phase: C — implement per section 10 of the design, in a
  dedicated PR that stops at the exit gate. Do not bundle E/F/H.
```

Do not change a phase to `COMPLETE` without adding its merged pull request and concrete validation evidence.
