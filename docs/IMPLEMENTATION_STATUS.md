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
| F3 — Read API, statistics and review | READY | F2 merged | Start from latest `develop` | Implement read-only `/api/v1/places*`, opaque cursor queries, distinct statistics and internal review/merge services. |
| F — Places metadata-first domain | IN_PROGRESS | Phases B and D | F1 and F2 complete; F3 next | Complete only after F3 merges with API, PostgreSQL and final e2e evidence. |
| E — Global worker foundation | READY | Phase C | None | Separate VPS phase. Do not mix with F3. |
| G — Places 2D UI and contextual navigation | BLOCKED | Complete Phase F | None | `/places`, map, filters, clusters, review UI, statistics and post deep links. |
| H — Deep Places analysis | BLOCKED | Phases C and E, stable F | None | FFmpeg, OCR, transcription, multimodal escalation and measured pilot. |
| I — Places 3D globe | BLOCKED | Phase G | None | Shared 2D/3D data source, synchronized selection and accessibility. |
| J — Unified MCP and Hermes | BLOCKED | Phase D; complete F for Places tools | None | One MCP server, shared API client and confirmations for sensitive commands. |

## Current execution pointer

```text
Current state
- F1 is merged and COMPLETE.
- F2 is merged and COMPLETE.
- F3 is the only allowed next Places implementation.
- No F3 implementation branch is active yet.
- G, H, I and J remain blocked by their stated dependencies.

Reference develop implementation commit
7cc05e2b7d1f66754d86c0aa6ea8fbb4135fa658

Recorded proof
- PR #30 merged after independent review.
- Reviewed F2 head: 655d0e9db2cba2b838258919222aae4fcc67bb4c.
- Merge commit: 7cc05e2b7d1f66754d86c0aa6ea8fbb4135fa658.
- CI run 30053205910 completed successfully.
- Final suite: 39 files, 278 passed, 0 failed.
- F2 introduced no migration; Neon develop remains on Phase C + F1 schema.
- Vercel Production tracks main and Preview tracks develop.
```

## Next agent action

1. Reset the constrained Claude branch from the latest `develop`.
2. Execute only F3 according to the reviewed design and task plan.
3. Add read-only Places API routes, cursor queries, distinct statistics and internal review/merge services.
4. Reuse Phase D authentication and keep the external API read-only.
5. Open a PR against `develop` and stop for Codex review.
6. Do not start Phase G or any UI/worker/video/MCP phase.

Do not change a phase or sub-phase to `COMPLETE` without a merged pull request and concrete validation evidence.
