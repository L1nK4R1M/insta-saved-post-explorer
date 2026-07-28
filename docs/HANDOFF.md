# Operational Handoff

Last updated: 28 July 2026  
Repository: `L1nK4R1M/insta-saved-post-explorer`  
Reference branch: `main`  
Reference production base: `main` at `44b0da02fe89396ac43fe6b29ff4a13b247674f1`
Reference implementation: `develop` at `67e3c1ba38cf350533c9a7ba27059c3fc368d727`

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

### Unreleased Places usability correction (28 July 2026)

- Branch: `codex/places-mobile-navigation-radius`, based on `origin/main` at
  `44b0da0`;
- VibeSpec: `specs/004-places-mobile-usability`, Standard, awaiting review;
- fixes the clipped mobile 2D/3D control, adds `Retour aux posts`, restores
  public configured-owner post thumbnails, and changes new city-like approximate
  scoring from 25 km to 10 km;
- verification: 29 focused unit tests, 6 desktop Places E2E, 1 mobile Places E2E,
  lint, typecheck, 360 full unit tests and production build all pass;
- no commit, push, PR, deploy, Neon write or existing-radius correction is
  claimed.

```text
Active review branch: codex/places-analysis-json-export
Reference: develop at f74302b3bba6bf9bd29ab66d6ef8fbc32d5479b3
Mode: critical
VibeSpec convergence: PASS

Production baseline:
- PR #45 deployed the DB-first extension convergence to `main` at `64f14cb`;
- the current promotion merges the complete reviewed `develop` history without
  discarding either Production hotfix commit.

Verified correction:
- PR #40 merged the extension/web refresh correction into develop at ba56573;
- PR #42 merged exact develop Preview support into develop at 2b877ba;
- the 4.2.6 follow-up makes the owner-scoped PostgreSQL snapshot authoritative
  for new/imported identity and preserves the legacy session arrays;
- extension archive and web ownership are separated;
- archive-only posts become durable reconciliation targets;
- a successful web sync aligns the extension archive to paired DB identities
  plus rows accepted during the run, including after a fresh installation;
- repeated Instagram cursors terminate;
- the web button observes its owner-scoped /api/sync/jobs/{id};
- the first terminal extension/server signal settles the UI once;
- duplicate running messages do not reset the watchdog; 90 seconds without a
  changed work checkpoint or durable job heartbeat becomes an actionable error;
- extension 4.2.6 allows the exact stable develop Preview at all three origin
  gates while preserving Production and localhost;
- arbitrary `*.vercel.app` deployments remain blocked.

Fresh gates:
- focused DB/extension/UI/media tests: 13/13;
- lint and typecheck: PASS;
- full unit suite: 329 passed, 129 skipped;
- production build: PASS, 32 pages;
- VibeSpec validation: 0 errors, 0 warnings;
- traceability: zero uncovered requirements;
- flat extension ZIP SHA-256:
  `E7EF63C70AC5054975A5B07C51BF6388EBC2048797719B6FE93008A237C5A48E`;
- git diff --check: PASS.

No migration, dependency, authentication, R2 permission or new API route is
included. The existing session response receives one additive `knownPosts`
field. Controlled Chromium discovers unpacked 4.2.6 on Production; authenticated
Preview and Instagram smoke plus Chrome Web Store publication remain operational
actions.

Phase F is CLOSED and COMPLETE.
Phase G is CLOSED and COMPLETE.
Phase I design is CLOSED and APPROVED (PR #35, squash 3fef818; ADR ACCEPTED).
Phase I implementation is CLOSED and COMPLETE (PR #36, squash 08be9f0).

CI #115 passed on reviewed head:
7477ac3c8e7f567051d3eb86cdf2fd91ddcbf1dc

Merge commit on develop:
08be9f04df60c9d8e138242fc0d7b0504e0ba51e

Performance validation:
FPS_BUDGET_VALIDATED_ON_REAL_GPU — closed 25 July 2026. Measured on an NVIDIA
GeForce RTX 5090 (ANGLE / Direct3D11): 240 fps and 276-326 ms first globe render
at 100, 500 and 1000 places, desktop and mobile viewport. All D6 budgets met.
No Phase I follow-up remains open.
```

### Places complete analysis JSON export

The tool on `codex/places-analysis-json-export` is verified and ready for review.
PR: `#46 — feat(places): export complete caption analysis JSON`.
It adds `npm run places:export-analysis-json` over the existing Phase F
caption-analysis workflow. It uses explicit develop/production database
variables, performs reads only, validates one strict JSON document, and writes
atomically below `.tmp`.

Fresh evidence:

- focused exporter and neighboring Places contracts: 45 passed;
- PostgreSQL caption workflow: 13 tests discovered but skipped without
  `TEST_DATABASE_URL`;
- full suite: 361 passed, 130 environment-bound skips;
- Prisma generation, lint, typecheck, build, and `git diff --check`: PASS;
- VibeSpec convergence: PASS;
- production smoke: correctly stopped with
  `TARGET_DATABASE_NOT_CONFIGURED`.

No production file exists yet. Configure `PLACES_PRODUCTION_DATABASE_URL` with
the intended read-only SSL DSN before running the command; never infer production
from the existing generic `DATABASE_URL`.

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
| Production | `main` / `br-super-snow-asyrmnbm` | Phase C, F1 and Phase E queue migrations applied. Application commit `66cfd78` is deployed; the validated Places batch is imported. VPS worker activation remains pending. |
| Development | `develop` / `br-sparkling-glade-as9gow4m` | Phase C and F1 migrations applied. F2, F3, G and I require no migration. |

Do not run `prisma migrate dev`, `prisma db push` or seeds against either deployed database.

### Places Production release (28 July 2026)

- PR #47 merged after CI #145 passed, including PostgreSQL, worker, browser and
  production-build jobs;
- Vercel deployment `dpl_2GFsngT1j5DtoypxtnGFpobUu4Po` is `READY`; `/api/health`
  reports database connected and version `44b0da0`;
- the Phase E queue migration was rehearsed on a disposable Neon branch and
  promoted transactionally with checksum
  `4c7b1d89faf0690bc9927f5966f12163403544e3a0bbd1159b8de153e7129bae`;
- rollback branch `backup-main-before-phase-e-2026-07-28`
  (`br-bold-salad-asxuxn2s`) is retained;
- candidate file SHA-256:
  `27d9f9e69631190cbe4cf344a64fe82e7f67a441bf19faba4844770204cc4a87`;
- import report: 407 valid, 0 invalid, 307 succeeded, 100 need review,
  0 failed, 154 unknown candidates and 0 errors;
- final unique aggregates: 51 places, 301 links, 254 linked posts,
  1,203 evidence rows and 407 analysis jobs;
- invariants: 0 failed/errored jobs, 0 owner mismatches and 0 approximate
  places without a radius;
- Production `/places` returns HTTP 200 and renders 51 places / 254 posts;
  Vercel reports no runtime error after release.

## 6. Phase state

| Phase | State | Reason |
| --- | --- | --- |
| C — R2 media identity and worker isolation | COMPLETE | PR #24; migration applied to Neon `main` and `develop`. |
| D — External API V1 | COMPLETE | PR #26. Distributed rate limiting remains deferred. |
| E — Global worker foundation | SCHEMA DEPLOYED, VPS ACTIVATION PENDING | PR #39 code and the additive queue migration are on Production. No VPS deployment or worker activation is claimed. |
| F — Places metadata-first domain | COMPLETE | F1/F2/F3 and hardening merged; exit gate accepted. |
| G — Places 2D UI | COMPLETE | PR #34, squash `2bd2098`; CI #107 green. |
| H — Deep Places analysis | BLOCKED | Requires Phase E operational activation and stable worker infrastructure. |
| I — Places 3D globe | COMPLETE | PR #35 design + PR #36 implementation merged. CI #115 green; WebGL lazy loading corrected; tests consolidated; no migration. |
| J — Unified MCP and Hermes | BLOCKED | Requires later orchestration decisions and confirmations. |

## 6.1 Test suite baseline (25 July 2026)

The global suite was audited and consolidated in a dedicated PR (documentation:
`changes/2026-07-25-global-test-suite-consolidation.md`). Current baseline:

```text
unit ...... 54 files, 448 tests, ~15-21 s
e2e ....... 46 scenarios, 46 executions (45 desktop + 1 mobile), ~69 s
```

Desktop is the default Playwright project and runs everything; the mobile project
runs only `@mobile`-tagged scenarios. Every viewport-sensitive test sets its own
viewport, so running it on both projects duplicated identical work — that was the
suite's largest single cost and it is removed.

The 11 PostgreSQL suites (129 tests, 61 % of unit time) are deliberately untouched:
ownership, composite FKs, idempotence, the P2002 regression, cursors, atomic
transactions, worker isolation and audit completeness.

## 7. Open decisions and operational follow-ups

- ~~**Phase I GPU measurement**~~ — **closed 25 July 2026**, status `FPS_BUDGET_VALIDATED_ON_REAL_GPU`. Measured on an NVIDIA GeForce RTX 5090: 240 fps and 276-326 ms first render at every place count, desktop and mobile viewport. This confirmed the recorded diagnosis — the CI figures (20 fps desktop, 18 fps mobile) were fill-rate bound on a SwiftShader software rasterizer, not scene bound. Both runs are kept in the change record. One honest limit stands: the mobile figures come from a mobile **viewport** on desktop-class hardware, not from a phone GPU, so low-end phone behaviour remains a reasoned expectation rather than a measurement — which is why the WebGL fallback and the pixel-ratio cap stay in place.
- server-side AI providers, models, budgets and escalation thresholds for Phase H;
- VPS credentials, firewall, backups, alerting and deployment authorization for Phase E;
- final confirmation model for sensitive Phase J commands.

## 8. Exact next action

1. Replace files in the existing unpacked
   extension directory with `C:\tmp\insta-saved-sync-v4.2.6-db-first.zip`, reload the
   extension and run the Preview smoke in
   `specs/002-extension-web-sync-reconciliation/08-release.md`.
2. Confirm extension discovery on the stable develop alias, click
   **Actualiser les posts**, and compare the extension count with the Preview
   library count.
3. Reload the exact 4.2.6 package against Production and confirm a
   refresh imports DB-missing posts, terminates, and a second refresh reports
   zero only when the DB and extension index are aligned.
4. Keep Phase H blocked until Phase E VPS operational activation is separately
   approved.
5. Keep worker activation, Hermes, MCP, OCR, transcription and multimodal
   analysis outside this correction.
