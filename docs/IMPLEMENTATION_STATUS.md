# Implementation Status

Last updated: 28 July 2026

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
| Extension/web sync reconciliation | COMPLETE | Existing sync API and extension | PR #40 squash `ba56573`; PR #42 squash `2b877ba`; 4.2.6 DB-first follow-up | PostgreSQL is authoritative; paired owner-scoped identities align a fresh or locally advanced extension after successful web sync. Duplicate running states no longer keep the spinner alive. Exact Preview origin remains bounded with no wildcard; RED/GREEN, 329 tests, build, VibeSpec validation and flat package inspection pass. Authenticated smoke remains an operator action. No migration. |
| C — R2 media identity and worker isolation | COMPLETE | Reviewed design | PR #24, squash `0870d69` | Additive migration, owner backfill, restricted role and PostgreSQL tests. Migration recorded on Neon `main` and `develop`. |
| D — External API V1 | COMPLETE | Phase A | PR #26, squash `9e57f93` | Read-only Bearer API, stable errors, six thin routes and tests. |
| F design and plan | COMPLETE | Phases B and D | PR #28, squash `fd9754e` | Reviewed metadata-first design, Geoapify abstraction and F1/F2/F3 plan. |
| F1 — Places schema and domain contracts | COMPLETE | F design | PR #29, squash `8bf8523` | 4 Places tables, SQL invariants, strict text candidates, opaque cursor, owner-scoped repository and idempotent jobs. Migration recorded on Neon `develop` and promoted transactionally to Neon `main` on 28 July 2026 after a disposable-branch rehearsal and backup branch creation. |
| F2 — Geoapify and caption resolution | COMPLETE | F1 merged | PR #30, squash `7cc05e2`; hardening PR #32, squash `216b975` | Server-only resolver, deterministic scoring, JSONL workflow, stale-input guard, atomic persistence, bounded retries with exponential backoff/jitter/Retry-After, quiet idempotent job creation, unit/e2e proof and successful owner-reported local rerun. No migration. |
| F3 — Read API, statistics and review | COMPLETE | F2 merged | PR #31, squash `15356e9` | Seven read-only Places routes, owner-scoped cursor queries, `source_theme` statistics, durable review decisions, complete audit evidence, exact job ownership validation, conditional Geoapify preflight, CI #94 green and Preview ready. No migration. |
| F — Places metadata-first domain | COMPLETE | Phases B and D | F1/F2/F3 + hardening PR #32, squash `216b975` | Code and robustness work complete. Exit gate accepted via a successful real local validation: real import succeeded, an identical re-import stayed idempotent with no unwanted duplicates, the expected P2002 no longer appears, transient errors recovered, and `UNKNOWN` was handled correctly. No migration; no public-contract break; no sensitive data committed. |
| E — Global worker foundation | COMPLETE | Phase C | PR #39, squash `c4e37f6` | Worker code promoted to Production with VibeSpec convergence PASS. The additive queue migration is recorded on Neon `main`; VPS operational activation remains pending. |
| G — Places 2D UI and contextual navigation | COMPLETE | Phase F complete | PR #34, squash `2bd2098` | `/places`, Leaflet + markercluster, Geoapify raster tiles, synchronized list, complete filters, statistics, detail sheet, review actions, deep links, responsive and keyboard-accessible UI. Review fixes validated: authenticated read Server Action, complete `sourceThemes`, all countries filterable. CI #107 green; 50 files / 440 tests locally; no migration. |
| Places mobile usability correction | COMPLETE | Phases G and I complete | PR #49, squash `8dbfd46` | Mobile 2D/3D bounds, explicit return link, public configured-owner linked-post reads and 10 km city approximation are on Production. CI #149 and Vercel deployment `dpl_HHKuBeSYf5L9izLHqCfMsyxmCNMh` passed. Neon backup `br-curly-firefly-asy8hqti` was created and exactly 29 existing 25 km rows were transactionally changed to 10 km with unchanged aggregates. Live mobile linked-post smoke and runtime-error checks pass. |
| Places address contract correction | IN_PROGRESS | Phase F2 complete | PR #52, squash `71106cc`; PR #54, squash `f98da30` | Strict candidate `address`, export schema v3, places-v2 identity and address-first Geoapify query are merged on develop. The authorized real dry-run returned amenity/rank 1/inner_part and scores EXACT at confidence 1 with radius null. CI #157 proves the 0.95 inner-part threshold, clean CLI exit, PostgreSQL automatic-primary supersession and confirmed-link preservation. Vercel develop deployment `dpl_GWMGkdvQptBCz1icJidE6zUJM8vL` is READY. No migration or data write; Production approval remains pending. |
| H — Deep Places analysis | BLOCKED | Phases C and E, stable F | None | FFmpeg, OCR, transcription, multimodal escalation and measured pilot. |
| I — Places 3D globe | COMPLETE | Phase G complete, design approved | PR #36, squash `08be9f0` | Historical Three.js implementation; T1–T10 merged and its real-GPU evidence remains recorded. The current working tree supersedes this runtime with the MapLibre follow-up below. |
| I follow-up — MapLibre 2D + globe renderer | IN_PROGRESS | Historical Phase I | Unmerged working tree | Shared MapLibre canvas, native globe projection, GeoJSON clustering, WebGL2 gate and local Natural Earth fallback. First-render budget met locally; FPS budget remains open because system Chromium uses SwiftShader (35–38 fps desktop, 23–24 fps mobile viewport). |
| J — Unified MCP and Hermes | BLOCKED | Phase D; complete F for Places tools | None | One MCP server, shared API client and confirmations for sensitive commands. |

## Current execution pointer

```text
Current state
- Phase F is CLOSED and COMPLETE.
- Phase G is CLOSED and COMPLETE (PR #34, squash 2bd2098).
- Phase I design is APPROVED and merged (PR #35, squash 3fef818); the ADR is ACCEPTED.
- Phase I implementation is CLOSED and COMPLETE after PR #36, squash merge
  08be9f04df60c9d8e138242fc0d7b0504e0ba51e.
- The unmerged MapLibre follow-up supersedes the historical Phase I runtime; it is
  not merged and its FPS D6 gate remains open pending a real-GPU run.
- Global test suite consolidation is CLOSED and COMPLETE after PR #38, squash merge
  fc019a410603f491adae253f1466e67e0e30f88e.
- CI #121 passed on reviewed head 60e228e7112b12ffaff9330b4ff2337206b7686a.
- Current test baseline: 54 unit files / 448 tests; 46 E2E scenarios / 46 executions
  (45 desktop + 1 mobile). Critical database and security suites remain intact.
- Phase E PR #39 is promoted to Production. Its additive queue migration is
  recorded on Neon `main`; VPS operational activation remains pending.
- PR #47 and the documentation follow-up PR #48 are merged on `main` at 44b0da0; the corresponding Vercel Production
  deployment is READY. The validated Places candidate batch imported 407/407
  posts with zero failures and zero importer errors.
- Production now contains 51 unique places, 301 post/place links, 254 linked
  posts, 1,203 evidence rows and 407 jobs (307 SUCCEEDED, 100 NEEDS_REVIEW).
  Owner-isolation and approximate-radius post-import checks have zero violations.
- The Places mobile usability correction is released through PR #49 at
  `8dbfd46`. Production has zero remaining 25 km rows and 29 corrected 10 km
  rows; backup branch `br-curly-firefly-asy8hqti` retains the prior state.
- The Places address contract correction is merged on `develop` through PR #52
  at `71106cc`. CI #153 and immutable Vercel Preview deployment
  `dpl_632ZKgw3HdT6XwuCfynP3RQkBZBc` pass. A read-only schema-v3 export of the
  real `hungryconsti` input succeeded. The owner then authorized the live
  Geoapify dry-run: amenity/rank 1/inner_part scored EXACT at confidence 1 with
  no radius, the importer exited 0, and Neon develop retained its original one
  approximate primary because the run was non-committing. PR #54 is merged at
  `f98da30`; CI #157 and the READY develop Preview pass. A final merged-revision
  dry-run remains required before any separately approved data write.
- PR #40 extension/web reconciliation is merged at ba56573 and PR #42 exact
  develop Preview support is merged at 2b877ba. The 4.2.6 DB-first follow-up
  preserves the additive legacy contract, repairs the no-progress watchdog and
  has fresh local verification. Extension reload and authenticated smoke remain.
- Phase H and Phase J remain blocked.

Reference develop implementation
`71106cc75ab16c5746c452f9332ef30df51557ca`, including PR #52 and the 4.2.6
DB-first synchronization correction.

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
4. Reload extension 4.2.6 from `C:\tmp\insta-saved-sync-v4.2.6-db-first.zip`
   in the existing Chrome extension directory and run
   the documented stable develop Preview smoke.
5. Phase H remains blocked until Phase E VPS operational activation is separately authorized.
6. Keep Phase E activation, H and J in separate changes; do not mix worker operations, deep analysis, Hermes or MCP work.

## Unmerged follow-up — MapLibre 2D + globe renderer

This working-tree change supersedes the historical Phase G Leaflet and Phase I
Three.js renderers in `src/features/places/components/places-map.tsx`. It is
intentionally not marked as a merged phase or PR result here; see the dedicated
change record and review before updating the historical status rows. The first
render budget passes locally; FPS remains open pending real-GPU validation.
