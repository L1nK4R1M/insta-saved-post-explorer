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
| F2 — Geoapify and caption resolution | COMPLETE | F1 merged | PR #30, squash `7cc05e2` | Server-only resolver, deterministic scoring, JSONL workflow, stale-input guard, atomic persistence, 278-test CI proof. No migration. |
| F3 — Read API, statistics and review | COMPLETE | F2 merged | PR #31, squash `15356e9` | Seven read-only Places routes, owner-scoped cursor queries, `source_theme` statistics, durable review decisions, complete audit evidence, exact job ownership validation, conditional Geoapify preflight, CI #94 green and Preview ready. No migration. |
| F — Places metadata-first domain | IN_PROGRESS | Phases B and D | F1/F2/F3 merged | Code implementation is complete. Controlled Geoapify pilot and explicit exit-gate evidence remain pending (`PILOT_BLOCKED_BY_ENV`). |
| E — Global worker foundation | READY | Phase C | None | Separate VPS phase. Do not mix with the Places pilot or Phase G. |
| G — Places 2D UI and contextual navigation | BLOCKED | Accepted Phase F pilot | None | `/places`, map, filters, clusters, review UI, statistics and post deep links. Must not start until the controlled pilot is recorded and Phase F is explicitly closed. |
| H — Deep Places analysis | BLOCKED | Phases C and E, stable F | None | FFmpeg, OCR, transcription, multimodal escalation and measured pilot. |
| I — Places 3D globe | BLOCKED | Phase G | None | Shared 2D/3D data source, synchronized selection and accessibility. |
| J — Unified MCP and Hermes | BLOCKED | Phase D; complete F for Places tools | None | One MCP server, shared API client and confirmations for sensitive commands. |

## Current execution pointer

```text
Current state
- F1 is merged and COMPLETE.
- F2 is merged and COMPLETE.
- F3 is merged and COMPLETE.
- Phase F code is complete and independently reviewed.
- Controlled Geoapify pilot is still blocked by environment: PILOT_BLOCKED_BY_ENV.
- Phase G remains blocked until pilot evidence is recorded and the Phase F exit gate is accepted.
- No implementation branch is currently active.

Reference develop implementation commit
15356e9333dfe84ec1c7a36a14fd1153f82f8c52

Recorded proof
- PR #31 merged after independent review.
- Reviewed F3 head: 96ce34ef89d214cf48d1258313686611f62a0d0d.
- Merge commit: 15356e9333dfe84ec1c7a36a14fd1153f82f8c52.
- CI run 30079965339 / CI #94 completed successfully.
- Reviewed-head Vercel Preview completed with state READY.
- F3 introduced no migration; Neon develop remains on the Phase C + F1 schema.
- Vercel Production tracks main and Preview tracks develop.
```

## Next agent action

1. Do not start Phase G.
2. Prepare a controlled development/test environment with `PLACES_ENABLED=1` and a non-production Geoapify key.
3. Execute the documented pilot on 30–50 eligible posts split between `Voyages` and `Restaurant`.
4. Record aggregate-only metrics and recovery evidence; never commit captions, JSONL, keys, OAuth credentials or production data.
5. Update `HANDOFF.md` and this ledger with the pilot results.
6. Decide explicitly whether Phase F becomes `COMPLETE` and Phase G becomes `READY`.

Do not change Phase F to `COMPLETE` or Phase G to `READY` until the controlled pilot and exit-gate evidence are recorded.