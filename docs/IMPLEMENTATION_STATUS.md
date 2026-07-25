# Implementation Status

Last updated: 25 July 2026

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
| E — Global worker foundation | READY | Phase C | None | Separate VPS phase. Required before Phase H deep analysis. |
| G — Places 2D UI and contextual navigation | COMPLETE | Phase F complete | PR #34, squash `2bd2098` | `/places`, Leaflet + markercluster, Geoapify raster tiles, synchronized list, complete filters, statistics, detail sheet, review actions, deep links, responsive and keyboard-accessible UI. Review fixes validated: authenticated read Server Action, complete `sourceThemes`, all countries filterable. CI #107 green; 50 files / 440 tests locally; no migration. |
| H — Deep Places analysis | BLOCKED | Phases C and E, stable F | None | FFmpeg, OCR, transcription, multimodal escalation and measured pilot. |
| I — Places 3D globe | READY | Phase G complete | None | Entry gate satisfied by the merged and stable 2D Places UI/data source. Must start in a dedicated branch after product/provider decisions are explicitly resolved. |
| J — Unified MCP and Hermes | BLOCKED | Phase D; complete F for Places tools | None | One MCP server, shared API client and confirmations for sensitive commands. |

## Current execution pointer

```text
Current state
- Phase F is CLOSED and COMPLETE.
- Phase G is CLOSED and COMPLETE after PR #34, squash merge 2bd2098472c65eeb24c52aa0ee893e09b8e20261.
- CI #107 passed on reviewed head 82a9760df92b5aa58f6a411c3f90bb07fb7cb46a.
- Phase I — Places 3D globe is READY, but implementation must not start until the 3D provider, visual contract and synchronization rules are explicitly decided.
- Phase E remains independently READY and is still required before Phase H.
- Phase H and Phase J remain blocked.

Reference develop implementation commit
2bd2098472c65eeb24c52aa0ee893e09b8e20261

Recorded proof
- PR #34 reviewed twice; all requested security, correctness and UX fixes were applied.
- The final PR head was mergeable and CI #107 completed successfully.
- PR #34 was squash-merged into develop as 2bd2098472c65eeb24c52aa0ee893e09b8e20261.
- No Prisma migration or public-contract break was introduced.
- Leaflet + Geoapify raster remains the approved Phase G stack for fewer than 1000 canonical places.
- Vercel Production tracks main and Preview tracks develop.
```

## Next agent action

1. Start from the latest `develop`; do not reuse the Phase G branch.
2. Before implementing Phase I, audit the existing 2D map, `PlacesMap` abstraction, URL state, selection model, detail sheet and accessibility fallbacks.
3. Resolve with the owner before coding: 3D engine/provider, globe visual style, 2D↔3D switching behaviour, shared selection/camera state, mobile fallback, performance budget and tile/terrain costs.
4. Produce a Phase I implementation brief, ADR and traceability matrix before changing production code.
5. Keep Phase I limited to the 3D Places experience. Do not mix Phase E, H, J, Hermes, MCP, OCR, transcription or worker work into the same PR.
