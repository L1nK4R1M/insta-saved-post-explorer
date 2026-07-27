# Implementation Status

Last updated: 26 July 2026

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
| Global test suite consolidation | COMPLETE | Current merged codebase | PR #38, squash `fc019a4` | Risk-based consolidation with zero production-code changes. Unit tests 466 → 448; E2E scenarios 56 → 46; E2E executions 112 → 46; mobile executions 56 → 1. CI #121 green. Critical PostgreSQL, ownership, security, API, idempotence, P2002 and WebGL regression coverage preserved. |
| C — R2 media identity and worker isolation | COMPLETE | Reviewed design | PR #24, squash `0870d69` | Additive migration, owner backfill, restricted role and PostgreSQL tests. Migration recorded on Neon `main` and `develop`. |
| D — External API V1 | COMPLETE | Phase A | PR #26, squash `9e57f93` | Read-only Bearer API, stable errors, six thin routes and tests. |
| F design and plan | COMPLETE | Phases B and D | PR #28, squash `fd9754e` | Reviewed metadata-first design, Geoapify abstraction and F1/F2/F3 plan. |
| F1 — Places schema and domain contracts | COMPLETE | F design | PR #29, squash `8bf8523` | 4 Places tables, SQL invariants, strict text candidates, opaque cursor, owner-scoped repository and idempotent jobs. Migration recorded on Neon `develop`. |
| F2 — Geoapify and caption resolution | COMPLETE | F1 merged | PR #30, squash `7cc05e2`; hardening PR #32, squash `216b975` | Server-only resolver, deterministic scoring, JSONL workflow, stale-input guard, atomic persistence, bounded retries with exponential backoff/jitter/Retry-After, quiet idempotent job creation, unit/e2e proof and successful owner-reported local rerun. No migration. |
| F3 — Read API, statistics and review | COMPLETE | F2 merged | PR #31, squash `15356e9` | Seven read-only Places routes, owner-scoped cursor queries, `source_theme` statistics, durable review decisions, complete audit evidence, exact job ownership validation, conditional Geoapify preflight, CI #94 green and Preview ready. No migration. |
| F — Places metadata-first domain | COMPLETE | Phases B and D | F1/F2/F3 + hardening PR #32, squash `216b975` | Code and robustness work complete. Exit gate accepted via a successful real local validation: real import succeeded, an identical re-import stayed idempotent with no unwanted duplicates, the expected P2002 no longer appears, transient errors recovered, and `UNKNOWN` was handled correctly. No migration; no public-contract break; no sensitive data committed. |
| E — Global worker foundation | AWAITING_REVIEW | Phase C | PR #39; `claude/phase-e-global-worker-foundation` | Seven earlier review findings and the final production R2 AbortSignal blocker corrected; fresh local gates and VibeSpec convergence PASS. Unmerged, with no hosted migration or VPS deployment. |
| G — Places 2D UI and contextual navigation | COMPLETE | Phase F complete | PR #34, squash `2bd2098` | `/places`, Leaflet + markercluster, Geoapify raster tiles, synchronized list, complete filters, statistics, detail sheet, review actions, deep links, responsive and keyboard-accessible UI. Review fixes validated: authenticated read Server Action, complete `sourceThemes`, all countries filterable. CI #107 green; 50 files / 440 tests locally; no migration. |
| H — Deep Places analysis | BLOCKED | Phases C and E, stable F | None | FFmpeg, OCR, transcription, multimodal escalation and measured pilot. |
| I — Places 3D globe | COMPLETE | Phase G complete, design approved | PR #36, squash `08be9f0` | T1–T10 merged: additive `view=map|globe`, pure projection module, renderer seam, WebGL probe and fallback, lazy `react-globe.gl` 2.38.0 / `three` 0.185.1, public-domain Natural Earth texture generated locally with documented licence, segmented `2D | 3D` control, shared filters/search/selection/list/statistics/detail, client aggregation, reduced motion and keyboard paths. CI #115 green; no migration, no API change, Leaflet preserved. Measured: `/places` initial 2D JS +4.2 KiB (+1.08 %), 3D chunk absent from the 2D entry; first globe render 907–1033 ms on the GPU-less CI baseline. **Performance validated on real GPU** (`FPS_BUDGET_VALIDATED_ON_REAL_GPU`, 25 July 2026): NVIDIA GeForce RTX 5090, 240 fps and 276-326 ms first render at 100/500/1000 places, desktop and mobile viewport — all D6 budgets met. No Phase I follow-up remains open. |
| J — Unified MCP and Hermes | BLOCKED | Phase D; complete F for Places tools | None | One MCP server, shared API client and confirmations for sensitive commands. |

## Current execution pointer

```text
Current state
- Phase F is CLOSED and COMPLETE.
- Phase G is CLOSED and COMPLETE (PR #34, squash 2bd2098).
- Phase I design is APPROVED and merged (PR #35, squash 3fef818); the ADR is ACCEPTED.
- Phase I implementation is CLOSED and COMPLETE after PR #36, squash merge
  08be9f04df60c9d8e138242fc0d7b0504e0ba51e.
- Global test suite consolidation is CLOSED and COMPLETE after PR #38, squash merge
  fc019a410603f491adae253f1466e67e0e30f88e.
- CI #121 passed on reviewed head 60e228e7112b12ffaff9330b4ff2337206b7686a.
- Current test baseline: 54 unit files / 448 tests; 46 E2E scenarios / 46 executions
  (45 desktop + 1 mobile). Critical database and security suites remain intact.
- Phase E PR #39 is AWAITING_REVIEW. The existing branch contains all seven
  earlier invariant corrections plus the final production R2 AbortSignal fix;
  full local gates and both review passes are green. Refreshed hosted checks
  must be observed after push. It remains unmerged and undeployed.
- Phase H and Phase J remain blocked.

Reference develop implementation commit
fc019a410603f491adae253f1466e67e0e30f88e

Recorded proof for Phase I
- PR #36 reviewed twice and squash-merged after the WebGL lazy-load defect was fixed.
- Phase I performance validated on real GPU hardware (NVIDIA GeForce RTX 5090, ANGLE/D3D11):
  240 fps and 276-326 ms first globe render at 100, 500 and 1000 places, desktop and
  mobile viewport. All D6 budgets met.
- Status: FPS_BUDGET_VALIDATED_ON_REAL_GPU.
- No Prisma migration, no public-contract break, no Neon change, no secret.

Recorded proof for global test consolidation
- PR #38 squash-merged with zero production-code changes.
- Unit tests: 466 -> 448.
- E2E scenarios: 56 -> 46.
- E2E executions: 112 -> 46; mobile executions: 56 -> 1.
- CI #121 green.
- PostgreSQL ownership, idempotence, P2002, transactions, worker isolation,
  security boundaries, API contracts and FR-I-12 lazy-loading regression preserved.
```

## Next agent action

1. Treat Phase I and the global test consolidation as merged and complete.
2. Use the consolidated baseline for future PRs; do not reintroduce duplicate desktop/mobile E2E executions without a real device-specific behavior.
3. Phase I performance is validated on real hardware and needs no further measurement; re-run `npm run places:measure-globe` only if the globe scene or engine version changes.
4. Re-review the verified Phase E PR #39 corrections against `develop`; do not
   merge, apply its hosted migration or deploy it automatically.
5. Phase H remains blocked until Phase E is merged and operational activation is separately authorized.
6. Keep Phase E, H and J in separate branches and PRs; do not mix worker, deep analysis, Hermes or MCP work.
