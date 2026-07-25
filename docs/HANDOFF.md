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
| I — Places 3D globe | AWAITING_OWNER_DECISION | Entry gate satisfied (Phase G complete, data source stable) and the design pack is delivered on `claude/phase-i-places-3d-design`. Implementation is held until the owner resolves `adr/ADR-places-3d-engine.md` §10. |
| J — Unified MCP and Hermes | BLOCKED | Requires later orchestration decisions and confirmations. |

## 7. Open decisions that must not be guessed

- **Phase I decisions — the design pack is ready and waiting on these** (`adr/ADR-places-3d-engine.md` §10):
  1. 3D engine — recommended: Three.js via `globe.gl`/`react-globe.gl`; alternatives: raw Three.js, CesiumJS, MapLibre globe;
  2. visual concept — Concept 1 cinematic, Concept 2 sober (lowest risk, recommended), or Concept 3 travel exploration;
  3. globe texture/basemap source and, for Cesium or MapLibre, the terrain/tile provider and its budget;
  4. 2D ↔ 3D behaviour — independent or shared camera; does the globe ever become the default view;
  5. mobile — full globe or 2D-only on small screens;
  6. performance budget — acceptable added bundle weight and target frame rate;
- server-side AI providers, models, budgets and escalation thresholds for Phase H;
- VPS credentials, firewall, backups and observability for Phase E;
- final confirmation model for sensitive Phase J commands.

## 8. Exact next action — Phase I decision

The Phase I preparation is **done** (design pack on `claude/phase-i-places-3d-design`):
brownfield audit, engine comparison, PROPOSED ADR with a weighted decision table,
three UX concepts, target architecture, FR/NFR with measurable criteria, acceptance
criteria, ordered tasks T0–T10, traceability matrix and test strategy. No production
code and no dependency were added.

1. Read `phase-i-places-3d-brief.md` and `adr/ADR-places-3d-engine.md`.
2. Decide ADR §10: engine, visual concept, basemap/terrain source, budget, 2D ↔ 3D behaviour, mobile.
3. Record the decisions in task T0 (ADR moved to `ACCEPTED`) — this is the gate; no production code before it.
4. Then implement T1–T10 from `superpowers/plans/2026-07-25-phase-i-places-3d.md` in a dedicated branch off the latest `develop`.
5. Keep Phase I to the 3D experience alone: no Phase E, H, J, worker, Hermes, MCP, OCR, transcription or multimodal analysis, no Prisma migration, and **do not replace Leaflet**.
