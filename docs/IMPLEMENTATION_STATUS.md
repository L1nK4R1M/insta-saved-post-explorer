# Implementation Status

Last updated: 24 July 2026

This file is the compact state ledger. Detailed scope, dependencies and exit gates remain authoritative in `CODEX_IMPLEMENTATION_ORDER.md` and `HANDOFF.md`.

Status values:

- `COMPLETE`: merged and supported by recorded proof;
- `READY`: entry gate is satisfied and work may start in a dedicated branch;
- `IN_PROGRESS`: the broader phase has completed sub-phases but is not finished;
- `AWAITING_REVIEW`: implementation proof exists but the work is not merged;
- `BLOCKED`: a required predecessor or decision is incomplete;
- `NOT_STARTED`: no work has begun and it is not the next executable phase.

| Phase | Status | Dependencies | Branch / PR | Required or recorded evidence |
| --- | --- | --- | --- | --- |
| 0 — API and Places audit | COMPLETE | None | PR #15 | Architecture, gaps, phase order and Places eligibility documented. |
| A — Library filter consistency | COMPLETE | Phase 0 | PR #18, squash `69ea0da` | Shared Prisma/SQL predicates and PostgreSQL regressions; CI green. |
| B — Places theme eligibility | COMPLETE | Phase A | PR #19, squash `2323e0d` | Canonical eligibility predicate and 8 tests; no collection dependency. |
| E2e suite re-green | COMPLETE | — | PR #21, squash `1b5fa16` | Browser suite restored to green. |
| C — R2 media identity and worker isolation | COMPLETE | Reviewed design | PR #24, squash `0870d69` | Additive migration, owner backfill, restricted role and PostgreSQL tests. Migration recorded on Neon `main` and `develop`. |
| D — External API V1 | COMPLETE | Phase A | PR #26, squash `9e57f93` | Read-only Bearer API, stable errors, six thin routes and tests. |
| F design and plan | COMPLETE | Phases B and D | PR #28, squash `fd9754e` | Reviewed metadata-first design, Geoapify abstraction and F1/F2/F3 plan. |
| F1 — Places schema and domain contracts | COMPLETE | F design | PR #29, squash `8bf8523` | 4 Places tables, SQL invariants, strict text candidates, opaque cursor, owner-scoped repository and idempotent jobs. Migration recorded on Neon `develop`. |
| F2 — Geoapify and caption resolution | COMPLETE | F1 merged | PR #30, squash `7cc05e2`; hardening PR #32, squash `216b975` | Server-only resolver, deterministic scoring, JSONL workflow, stale-input guard, atomic persistence, bounded retries with exponential backoff/jitter/Retry-After, quiet idempotent job creation, unit/e2e proof and successful owner-reported local rerun. No migration. |
| F3 — Read API, statistics and review | COMPLETE | F2 merged | PR #31, squash `15356e9` | Seven read-only Places routes, owner-scoped cursor queries, `source_theme` statistics, durable review decisions, complete audit evidence, exact job ownership validation, conditional Geoapify preflight, CI #94 green and Preview ready. No migration. |
| F — Places metadata-first domain | COMPLETE | Phases B and D | F1/F2/F3 + hardening PR #32, squash `216b975` | Code and robustness work complete. Exit gate accepted via a successful real local validation: real import succeeded, an identical re-import stayed idempotent with no unwanted duplicates, the expected P2002 no longer appears, transient errors recovered, and `UNKNOWN` was handled correctly. No migration; no public-contract break; no sensitive data committed. |
| E — Global worker foundation | READY | Phase C | None | Separate VPS phase. Do not mix with Phase G. |
| G — Places 2D UI and contextual navigation | AWAITING_REVIEW | Phase F complete | `claude/phase-g-places-2d-ui` | `/places` route and header entry, Leaflet + markercluster behind a swappable `PlacesMap`, Geoapify raster tiles with mandatory attribution, EXACT/PROBABLE pins, APPROXIMATE zone + radius, UNKNOWN never mapped, hover callout with photo, detail sheet, synchronized list, search, filters behind one button (theme, place type, precision, review, country), statistics limited to theme and country, review via internal Server Actions, URL deep links, responsive and keyboard-accessible. Additive read-only API filters (`categories`, `source_theme`); no migration. Docs: `places-ui.md`. |
| H — Deep Places analysis | BLOCKED | Phases C and E, stable F | None | FFmpeg, OCR, transcription, multimodal escalation and measured pilot. |
| I — Places 3D globe | BLOCKED | Phase G | None | Shared 2D/3D data source, synchronized selection and accessibility. |
| J — Unified MCP and Hermes | BLOCKED | Phase D; complete F for Places tools | None | One MCP server, shared API client and confirmations for sensitive commands. |

## Current execution pointer

```text
Current state
- F1 is merged and COMPLETE.
- F2 is merged, hardened by PR #32, and COMPLETE.
- F3 is merged and COMPLETE.
- Phase F is CLOSED (COMPLETE): the exit gate was accepted via a successful real local validation.
- Phase G is implemented and AWAITING_REVIEW on `claude/phase-g-places-2d-ui` (2D only).
  Owner decisions applied: Leaflet + Geoapify raster tiles, all places loaded client-side
  (no bbox, no map pagination), brunch folded into the café group for now, multi-select filters.
- Phases H (deep analysis) and I (3D globe) remain untouched.

Reference develop implementation commit
216b97527bc091d6ffe24925ab3463f7d1f0f1c6

Recorded proof
- PR #31 merged after independent review (F3 merge commit 15356e9; CI run 30079965339 / CI #94 green).
- PR #32 reviewed and squash-merged; reviewed head a62bf57; hardening merge commit 216b975; CI green.
- PR #32 introduced no migration and no public-contract break.
- Real local validation succeeded (real DB, development-only Geoapify key, real local JSONL):
  idempotent import, expected P2002 gone, transient-error recovery, UNKNOWN handled; no secret or JSONL committed.
- Neon develop remains on the Phase C + F1 schema.
- Vercel Production tracks main and Preview tracks develop.
```

## Next agent action

1. Do not start Phase G implementation in this documentation change.
2. On an explicit Phase G prompt, create `claude/phase-g-places-2d-ui`, reset from the latest `develop`.
3. Follow `phase-g-places-2d-ui-brief.md`, which defers to `CODEX_IMPLEMENTATION_ORDER.md` §5 Phase G and `CODEX_PLACES_EXTENSION.md` §13–§14 as the authoritative contract.
4. Resolve the open Phase G product decisions (map library, tile provider, cluster behaviour, viewport limits, display thresholds, final design) with the owner before implementation — do not guess them.
5. Reuse the existing read-only `/api/v1/places*` routes and server query/stats/review services; no direct Prisma in components, no internal HTTP loop from Server Components; 2D only (no 3D globe — Phase I; no deep multimodal — Phase H).
