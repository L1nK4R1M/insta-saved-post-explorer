# Operational Handoff

Last updated: 25 July 2026  
Repository: `L1nK4R1M/insta-saved-post-explorer`  
Reference branch: `develop`  
Reference implementation commit: `2bd2098472c65eeb24c52aa0ee893e09b8e20261`

## 1. Purpose and authority

This file records the current operational state for the next agent session. It does not replace product or architecture contracts.

Authority order:

1. `../AGENTS.md` for global rules and prohibitions;
2. this file for the active phase and verified state;
3. `CODEX_IMPLEMENTATION_ORDER.md` for phase dependencies and exit gates;
4. the reviewed design and implementation brief for the active phase;
5. the code on the latest `develop`.

Stop and document any conflict between this handoff, an authoritative contract and the current code before editing.

## 2. Completed work

| Phase | Outcome |
| --- | --- |
| 0 — API and Places audit | PR #15. Architecture locked to one app, one PostgreSQL project, one R2 account, one global worker and one global MCP. Places eligibility comes only from `Post.mainTheme`. |
| A — Library filter consistency | PR #18, squash `69ea0da`. Shared predicates and PostgreSQL regressions. |
| B — Places theme eligibility | PR #19, squash `2323e0d`. Canonical Places eligibility. |
| C — R2 media identity and worker isolation | PR #24, squash `0870d69`. Authoritative R2 identity, owner backfill and restricted worker role. |
| D — External API V1 | PR #26, squash `9e57f93`. Read-only Bearer API and stable errors. |
| F1 — Places schema and domain contracts | PR #29, squash `8bf8523`. Places schema, SQL invariants, owner-scoped inputs and idempotent jobs. |
| F2 — Geoapify and caption resolution | PR #30, squash `7cc05e2`; hardened by PR #32, squash `216b975`. Deterministic resolver, JSONL workflow, retries, quiet idempotence. |
| F3 — Read API, statistics and review | PR #31, squash `15356e9`. Read-only Places routes, statistics, durable review decisions and audit evidence. |
| F — Places metadata-first domain | COMPLETE. Exit gate accepted after successful real local validation with idempotent re-import, recovered transient errors and correct `UNKNOWN` handling. |
| G — Places 2D UI and contextual navigation | PR #34, squash `2bd2098`. `/places`, Leaflet clustering, Geoapify raster tiles, synchronized list, filters, statistics, detail sheet, review actions, deep links, responsive and keyboard-accessible UI. |

## 3. Current execution pointer

```text
No implementation branch is currently active.

Phase F is CLOSED and COMPLETE.
Phase G is CLOSED and COMPLETE.

PR #34 was reviewed twice and squash-merged into develop:
2bd2098472c65eeb24c52aa0ee893e09b8e20261

Reviewed head:
82a9760df92b5aa58f6a411c3f90bb07fb7cb46a

CI #107: SUCCESS.
No Prisma migration or public-contract break.
```

Phase G owner decisions now recorded as final for the 2D implementation:

- Leaflet + `leaflet.markercluster`;
- Geoapify raster tiles with mandatory attribution;
- all canonical places loaded client-side because the expected maximum remains below 1000;
- no bbox/viewport querying and no map pagination;
- `PlacesMap` kept as a lightweight swappable abstraction;
- Apple-Plans-inspired minimal design;
- brunch provisionally folded into the café group;
- multi-select filters enabled.

## 4. Phase G merge proof

- PR: `#34 — feat(places): Phase G — Places 2D UI and contextual navigation`;
- reviewed head: `82a9760df92b5aa58f6a411c3f90bb07fb7cb46a`;
- squash merge on `develop`: `2bd2098472c65eeb24c52aa0ee893e09b8e20261`;
- CI run #107 completed successfully;
- final local proof reported in the PR: 50 files, 440 tests passed, 0 failed; build and e2e green;
- security correction: `loadPlacePostsAction()` now verifies the session before any read and remains owner-scoped;
- correctness correction: `sourceThemes` is derived from all linked posts instead of the first six;
- UX correction: every country remains selectable through a searchable, scrollable local filter;
- no migration, no Prisma schema change and no breaking API change.

## 5. Environment and deployment state

### Vercel

| Environment | Git branch | State |
| --- | --- | --- |
| Production | `main` | Isolated from development. |
| Preview development | `develop` | Tracks the merged Phase G implementation. |

Stable URLs:

```text
Production: https://insta-saved-post-explorer.vercel.app
Develop:    https://insta-saved-post-explorer-git-develop-l1nk4r1ms-projects.vercel.app
```

### Neon

Project: `fancy-mud-69762258`

| Environment | Neon branch | Verified schema state |
| --- | --- | --- |
| Production | `main` / `br-super-snow-asyrmnbm` | Phase C migration applied. F1 remains intentionally unpromoted. |
| Development | `develop` / `br-sparkling-glade-as9gow4m` | Phase C and F1 migrations applied. F2, F3 and G require no migration. |

Do not run `prisma migrate dev`, `prisma db push` or seeds against either deployed database.

## 6. Phase state

| Phase | State | Reason |
| --- | --- | --- |
| C — R2 media identity and worker isolation | COMPLETE | PR #24; migration applied to Neon `main` and `develop`. |
| D — External API V1 | COMPLETE | PR #26. Distributed rate limiting remains deferred. |
| E — Global worker foundation | READY, separate | Required before Phase H. Do not mix it into Phase I. |
| F — Places metadata-first domain | COMPLETE | F1/F2/F3 and hardening merged; exit gate accepted. |
| G — Places 2D UI | COMPLETE | PR #34, squash `2bd2098`; CI #107 green. |
| H — Deep Places analysis | BLOCKED | Requires Phase E and stable worker infrastructure. |
| I — Places 3D globe | READY | Phase G is complete and the shared Places data source is stable. |
| J — Unified MCP and Hermes | BLOCKED | Requires later orchestration decisions and confirmations. |

## 7. Open decisions that must not be guessed

- 3D engine/provider for Phase I (`Three.js`, Cesium or another explicitly approved option);
- terrain/building/globe tile provider and cost model;
- final 3D visual direction and interaction contract;
- 2D ↔ 3D switching behaviour;
- shared selection, URL state and camera synchronization;
- mobile and accessibility fallback for the 3D view;
- performance budget for fewer than 1000 canonical places;
- server-side AI providers, models, budgets and escalation thresholds for Phase H;
- VPS credentials, firewall, backups and observability for Phase E;
- final confirmation model for sensitive Phase J commands.

## 8. Exact next action — Phase I preparation

1. Start from the latest `develop`; do not reuse `claude/phase-g-places-2d-ui`.
2. Perform a brownfield audit of the merged `/places` implementation, especially `PlacesMap`, query-state, selection, detail sheet, statistics and accessibility fallbacks.
3. Do not write production code before the owner has explicitly chosen the 3D engine/provider and visual direction.
4. Produce a Phase I entry brief, ADR, requirements, acceptance criteria, implementation tasks and traceability matrix.
5. Keep the first Phase I PR limited to documentation and architecture unless the owner explicitly authorizes implementation.
6. Do not mix Phase E, H, J, worker, Hermes, MCP, OCR, transcription or multimodal analysis into Phase I.
