# Implementation Status

Last updated: 25 July 2026

This file is the compact state ledger. Detailed scope, dependencies and exit gates remain authoritative in `CODEX_IMPLEMENTATION_ORDER.md` and `HANDOFF.md`.

Status values:

- `COMPLETE`: merged and supported by recorded proof;
- `READY`: entry gate is satisfied and work may start in a dedicated branch;
- `IN_PROGRESS`: the broader phase has completed sub-phases but is not finished;
- `AWAITING_REVIEW`: implementation proof exists but the work is not merged;
- `AWAITING_OWNER_DECISION`: the entry gate is satisfied and the design pack exists, but implementation is held until the owner resolves the recorded product/provider decisions;
- `DESIGN_APPROVED`: the design pack is approved and every product/provider decision is closed; implementation may start in a dedicated PR but no production code exists yet;
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
| I — Places 3D globe | COMPLETE | Phase G complete, design approved | PR #36, squash `08be9f0` | T1–T10 merged: additive `view=map|globe`, pure projection module, renderer seam, WebGL probe and fallback, lazy `react-globe.gl` 2.38.0 / `three` 0.185.1, public-domain Natural Earth texture generated locally with documented licence, segmented `2D | 3D` control, shared filters/search/selection/list/statistics/detail, client aggregation, reduced motion and keyboard paths. CI #115 green; 466 unit tests and 92 e2e green after risk-based consolidation. No migration, no API change, Leaflet preserved. Measured: `/places` initial 2D JS +4.2 KiB (+1.08 %), 3D chunk absent from the 2D entry, first globe render 907–1033 ms at 1000 places. `FPS_BUDGET_PENDING_REAL_GPU_VALIDATION` remains an operational follow-up, not a merge blocker. |
| J — Unified MCP and Hermes | BLOCKED | Phase D; complete F for Places tools | None | One MCP server, shared API client and confirmations for sensitive commands. |

## Current execution pointer

```text
Current state
- Phase F is CLOSED and COMPLETE.
- Phase G is CLOSED and COMPLETE (PR #34, squash 2bd2098).
- Phase I design is APPROVED and merged (PR #35, squash 3fef818); the ADR is ACCEPTED.
- Phase I implementation is CLOSED and COMPLETE after PR #36, squash merge
  08be9f04df60c9d8e138242fc0d7b0504e0ba51e.
- CI #115 passed on reviewed head 7477ac3c8e7f567051d3eb86cdf2fd91ddcbf1dc.
- Phase E remains independently READY and is still required before Phase H.
- Phase H and Phase J remain blocked.

Reference develop implementation commit
08be9f04df60c9d8e138242fc0d7b0504e0ba51e

Recorded proof for Phase I
- PR #36 reviewed twice and squash-merged after the WebGL lazy-load defect was fixed.
- lint, typecheck, 466 unit tests, build and 92 e2e tests green.
- Phase I test suites consolidated to 18 unit / 8 component / 7 e2e.
- The Phase G e2e suite passes unmodified.
- /places initial 2D client JS: 392.0 KiB -> 396.3 KiB (+4.2 KiB, +1.08 %).
- The 1.86 MiB 3D chunk is absent from the /places 2D entry.
- First globe render 907-1033 ms with 1000 places.
- Frame rate measured under SwiftShader: 20 fps desktop / 18 fps mobile.
  Status: FPS_BUDGET_PENDING_REAL_GPU_VALIDATION.
- No Prisma migration, no public-contract break, no Neon change, no secret.
```

## Next agent action

1. Treat Phase I as merged and complete; do not reopen its settled architecture decisions.
2. Optionally run `npm run places:measure-globe` on a machine with a real GPU and record the result under `FPS_BUDGET_PENDING_REAL_GPU_VALIDATION`.
3. The next executable infrastructure phase is Phase E — Global worker foundation.
4. Phase H remains blocked until Phase E is complete.
5. Keep Phase E, H and J in separate branches and PRs; do not mix worker, deep analysis, Hermes or MCP work.