# Operational Handoff

Last updated: 25 July 2026  
Repository: `L1nK4R1M/insta-saved-post-explorer`  
Reference branch: `develop`  
Reference implementation commit: `08be9f04df60c9d8e138242fc0d7b0504e0ba51e`

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
| I design — Places 3D globe | PR #35, squash `3fef818`. ADR `ACCEPTED`, six decisions closed, T0 satisfied. |
| I implementation — Places 3D globe | PR #36, squash `08be9f0`. T1–T10 merged after two review rounds. WebGL-gated lazy loading, risk-based test consolidation, local Natural Earth texture, shared 2D/3D state and documented performance evidence. |

## 3. Current execution pointer

```text
No implementation branch is currently active.

Phase F is CLOSED and COMPLETE.
Phase G is CLOSED and COMPLETE.
Phase I design is CLOSED and APPROVED (PR #35, squash 3fef818; ADR ACCEPTED).
Phase I implementation is CLOSED and COMPLETE (PR #36, squash 08be9f0).

CI #115 passed on reviewed head:
7477ac3c8e7f567051d3eb86cdf2fd91ddcbf1dc

Merge commit on develop:
08be9f04df60c9d8e138242fc0d7b0504e0ba51e

Operational follow-up only:
FPS_BUDGET_PENDING_REAL_GPU_VALIDATION — the CI container used SwiftShader and no
real GPU. This does not reopen or block the merged Phase I architecture.
```

Phase G owner decisions remain final for the 2D implementation:

- Leaflet + `leaflet.markercluster`;
- Geoapify raster tiles with mandatory attribution;
- all canonical places loaded client-side because the expected maximum remains below 1000;
- no bbox/viewport querying and no map pagination;
- `PlacesMap` kept as a lightweight swappable abstraction;
- Apple-Plans-inspired minimal design;
- brunch provisionally folded into the café group;
- multi-select filters enabled.

Phase I owner decisions remain final and implemented:

- `react-globe.gl` / `globe.gl` with Three.js underneath;
- Concept 2 sober with restrained Concept 1 elements;
- static public-domain Natural Earth texture with documented licence;
- additive `view=map|globe`, 2D default and independent cameras;
- full mobile 3D where WebGL is supported;
- accessible fallback to 2D;
- shared filters, search, selection, list, statistics and detail;
- no replacement of Leaflet.

## 4. Merge proof

### Phase G

- PR: `#34 — feat(places): Phase G — Places 2D UI and contextual navigation`;
- reviewed head: `82a9760df92b5aa58f6a411c3f90bb07fb7cb46a`;
- squash merge on `develop`: `2bd2098472c65eeb24c52aa0ee893e09b8e20261`;
- CI run #107 completed successfully;
- no migration, no Prisma schema change and no breaking API change.

### Phase I design

- PR: `#35 — docs(places): Phase I — 3D globe design pack`;
- reviewed head: `d4f7cc87435de66a05d41b126294f1292413ab17`;
- squash merge on `develop`: `3fef818df96f127d5ba9486650a231f6ee2629b4`;
- ADR accepted and all six owner decisions closed.

### Phase I implementation

- PR: `#36 — feat(places): Phase I — implémentation du globe 3D (T1–T10)`;
- reviewed head: `7477ac3c8e7f567051d3eb86cdf2fd91ddcbf1dc`;
- squash merge on `develop`: `08be9f04df60c9d8e138242fc0d7b0504e0ba51e`;
- CI #115 completed successfully;
- review round 1 found a real FR-I-12 defect: the 3D chunk could be requested before the WebGL probe answered;
- final implementation has explicit `map | probing | globe` states and does not request the 3D chunk before proven WebGL support;
- Phase I tests consolidated to 18 unit, 8 component and 7 e2e scenarios;
- repository verification: 466 unit tests and 92 e2e passed;
- initial `/places` 2D JS increased by 4.2 KiB (+1.08 %);
- the 1.86 MiB 3D chunk is absent from the initial 2D entry;
- first globe render measured at 907–1033 ms with about 1000 places;
- no migration, no public API break, no Neon change and no secret committed.

## 5. Environment and deployment state

### Vercel

| Environment | Git branch | State |
| --- | --- | --- |
| Production | `main` | Isolated from development. |
| Preview development | `develop` | Tracks the merged Phase I implementation. |

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
| Development | `develop` / `br-sparkling-glade-as9gow4m` | Phase C and F1 migrations applied. F2, F3, G and I require no migration. |

Do not run `prisma migrate dev`, `prisma db push` or seeds against either deployed database.

## 6. Phase state

| Phase | State | Reason |
| --- | --- | --- |
| C — R2 media identity and worker isolation | COMPLETE | PR #24; migration applied to Neon `main` and `develop`. |
| D — External API V1 | COMPLETE | PR #26. Distributed rate limiting remains deferred. |
| E — Global worker foundation | READY, separate | Required before Phase H. This is the next executable infrastructure phase. |
| F — Places metadata-first domain | COMPLETE | F1/F2/F3 and hardening merged; exit gate accepted. |
| G — Places 2D UI | COMPLETE | PR #34, squash `2bd2098`; CI #107 green. |
| H — Deep Places analysis | BLOCKED | Requires Phase E and stable worker infrastructure. |
| I — Places 3D globe | COMPLETE | PR #35 design + PR #36 implementation merged. CI #115 green; WebGL lazy loading corrected; tests consolidated; no migration. |
| J — Unified MCP and Hermes | BLOCKED | Requires later orchestration decisions and confirmations. |

## 7. Open decisions and operational follow-ups

- **Phase I GPU measurement:** status `FPS_BUDGET_PENDING_REAL_GPU_VALIDATION`. SwiftShader measured 20 fps desktop and 18 fps mobile. The workload evidence is fill-rate bound and the applied pixel-ratio cap improved mobile from 12 to 18 fps. A real-GPU run remains useful, but it is not a merge blocker and does not reopen Phase I.
- server-side AI providers, models, budgets and escalation thresholds for Phase H;
- VPS credentials, firewall, backups and observability for Phase E;
- final confirmation model for sensitive Phase J commands.

## 8. Exact next action

1. Start the next selected phase from the latest `develop` at `08be9f04df60c9d8e138242fc0d7b0504e0ba51e`.
2. Phase E — Global worker foundation is READY and is required before Phase H.
3. Optionally validate Phase I on a machine with a real GPU:
   `npm run build && npm run start`, then
   `DATABASE_URL=<local> npm run places:measure-globe -- --url http://127.0.0.1:3000`.
4. Keep Phase E, H and J isolated in separate branches and PRs.
5. Do not mix worker, Hermes, MCP, OCR, transcription or multimodal analysis into maintenance work for Phase I.