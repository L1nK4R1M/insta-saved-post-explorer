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
| B — Places theme eligibility | AWAITING_REVIEW | Phase A merged | `claude/insta-saved-post-explorer-continue-wli2my` / PR #19 | `PLACES_ELIGIBLE_THEMES` + `isPlacesEligibleTheme()` in `src/lib/places/eligibility.ts` reusing `foldForSearch()`; 8 unit tests in `tests/unit/places-eligibility.test.ts` covering exact positive and negative cases; no collection query; no index added; lint, typecheck, 137 tests, build all green. |
| C — R2 media identity and worker isolation | NOT_STARTED | Separate reviewed design | None | Canonical R2 identity; restricted worker access; `ownerId` isolation; migration recovery plan. |
| D — External API V1 | BLOCKED | Phase A and prerequisites in implementation order | None | Authenticated read-only `/api/v1`; stable errors; reused server services; route regressions; deployment preflight. |
| E — Global worker foundation | BLOCKED | Phase C | None | Claim, lease, heartbeat, retry, cleanup, healthcheck, restricted DB and R2 access, no public port. |
| F — Places metadata-first domain | BLOCKED | Phases B, D, and relevant worker/data gates | None | Place models, verified resolution, human review, idempotent jobs, unique statistics, no collection dependency. |
| G — Places 2D UI and contextual navigation | BLOCKED | Phase F | None | `/places`, map, filters, clusters, review, statistics, post deep links, desktop and mobile navigation. |
| H — Deep Places analysis | BLOCKED | Phases C and E, stable Places domain | None | FFmpeg pipeline, OCR, transcription, multimodal escalation, prompt-injection tests, guaranteed cleanup, measured pilot. |
| I — Places 3D globe | BLOCKED | Phase G and stable Places data | None | Shared data source with 2D map, synchronized selection, fly-to, accessibility, mobile fallback. |
| J — Unified MCP and Hermes | BLOCKED | Phase D; Phase F for Places tools | None | One MCP server, shared API client, no DB or R2 access, confirmations for sensitive commands, one Hermes integration. |

## Current Execution Pointer

```text
Current state: Phases A and B COMPLETE (PRs #18 and #19 merged).
E2e re-green chantier implemented, AWAITING_REVIEW (PR #21, closes issue #20):
  CSS ribbon-overflow fix + e2e spec realignment, 65/65 runnable tests green locally.
Required stop: human review and merge of PR #21
Next implementation phase after merge: C — R2 media identity and worker isolation
  (requires its own design and migration review)
```

Do not change a phase to `COMPLETE` without adding its merged pull request and concrete validation evidence.
