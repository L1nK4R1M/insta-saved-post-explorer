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
| F1 — Places schema and domain contracts | COMPLETE | F design | PR #29, squash `8bf8523` | 4 Places tables, SQL invariants, strict text candidates, opaque cursor, owner-scoped repository, idempotent jobs, 191-test CI proof. Migration `20260723150157_add_places_domain` recorded on Neon `develop`. |
| F2 — Geoapify and caption resolution | READY | F1 merged | Start from latest `develop` | Implement resolver, deterministic scoring, local JSONL ingestion and atomic persistence. No UI, video analysis, VPS worker or MCP. |
| F3 — Read API, statistics and review | BLOCKED | F2 merged | None | Read-only `/api/v1/places*`, cursor queries, distinct statistics and review/merge services. |
| F — Places metadata-first domain | IN_PROGRESS | Phases B and D | F1 complete; F2 next | Complete only after F2 and F3 merge with PostgreSQL, API and final e2e evidence. |
| E — Global worker foundation | READY | Phase C | None | Separate VPS phase. Do not mix with F2. |
| G — Places 2D UI and contextual navigation | BLOCKED | Complete Phase F | None | `/places`, map, filters, clusters, review UI, statistics and post deep links. |
| H — Deep Places analysis | BLOCKED | Phases C and E, stable F | None | FFmpeg, OCR, transcription, multimodal escalation and measured pilot. |
| I — Places 3D globe | BLOCKED | Phase G | None | Shared 2D/3D data source, synchronized selection and accessibility. |
| J — Unified MCP and Hermes | BLOCKED | Phase D; complete F for Places tools | None | One MCP server, shared API client and confirmations for sensitive commands. |

## Current execution pointer

```text
Current state
- F1 is merged and COMPLETE.
- F2 is the only allowed next Places implementation.
- No F2 implementation branch is active yet.
- F3, G, H, I and J remain blocked by their stated dependencies.

Reference develop implementation commit
8bf8523850688965f993d3e6a805e2c605a13669

Environment proof
- Vercel Production tracks main.
- Vercel Preview tracks develop.
- Production API is healthy and reports totalLibrary: 3417.
- Neon main has Phase C recorded.
- Neon develop has Phase C and F1 recorded.
- develop Preview deployment for 8bf8523 is READY.
```

## Next agent action

1. Reset the constrained Claude branch from the latest `develop`.
2. Execute only F2 according to the reviewed design and task plan.
3. Use test-driven development and owner-scoped PostgreSQL tests.
4. Open a PR against `develop` and stop for Codex review.
5. Do not start F3 or any UI/worker/MCP phase.

Do not change a phase or sub-phase to `COMPLETE` without a merged pull request and concrete validation evidence.