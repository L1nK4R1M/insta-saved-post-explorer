# Operational Handoff

Last updated: 24 July 2026  
Repository: `L1nK4R1M/insta-saved-post-explorer`  
Reference branch: `develop`  
Reference implementation commit: `216b97527bc091d6ffe24925ab3463f7d1f0f1c6`

## 1. Purpose and authority

This file records the current operational state for the next agent session. It does not replace product or architecture contracts.

Authority order:

1. `../AGENTS.md` for global rules and prohibitions;
2. this file for the active phase and verified environment state;
3. `CODEX_IMPLEMENTATION_ORDER.md` for phase dependencies and exit gates;
4. the reviewed design and implementation plan for the active phase;
5. the code on the latest `develop`.

Stop and document any conflict between this handoff, an authoritative contract, and the current code before editing.

## 2. Completed work

| Phase | Outcome |
| --- | --- |
| 0 — API and Places audit | Merged in PR #15. Architecture locked to one app, one PostgreSQL project, one R2 account, one global worker and one global MCP. Places eligibility comes only from `Post.mainTheme`. |
| A — Library filter consistency | Merged in PR #18, squash `69ea0da`. Shared predicates and PostgreSQL regressions cover list/count/random consistency. |
| B — Places theme eligibility | Merged in PR #19, squash `2323e0d`. `PLACES_ELIGIBLE_THEMES` and `isPlacesEligibleTheme()` are canonical. |
| E2e suite re-green | Merged in PR #21, squash `1b5fa16`. Browser suite restored to green. |
| C — R2 media identity and worker isolation | Merged in PR #24, squash `0870d69`. Authoritative R2 identity, owner backfill and restricted `ipe_worker_reader`. |
| D — External API V1 | Merged in PR #26, squash `9e57f93`. Read-only Bearer API, stable errors and six thin `/api/v1` routes. |
| F design and plan | Merged in PR #28, squash `fd9754e`. Geoapify is hidden behind `PlaceResolver`; model output is text-only; F is split into F1/F2/F3. |
| F1 — Places schema and domain contracts | Merged in PR #29, squash `8bf8523`. Places schema, SQL invariants, candidate contracts, opaque cursor, owner-scoped inputs and idempotent metadata jobs. |
| F2 — Geoapify and caption resolution | Merged in PR #30, squash `7cc05e2`. Server-only Geoapify resolver, deterministic scoring, caption JSONL export/import, stale-input protection and atomic owner-scoped persistence. |
| F3 — Read API, statistics and review | Merged in PR #31, squash `15356e9`. Seven read-only Places routes, owner-scoped cursor queries, distinct statistics, internal review/merge services, durable human decisions, complete audit proofs and conditional Geoapify preflight. |
| F hardening — pipeline robustness | Merged in PR #32, squash `216b975`. Resilient Geoapify retries (timeouts, network, HTTP 408/429/500/502/503/504) with capped exponential backoff, jitter and `Retry-After`; bounded `PLACES_RESOLVER_*` config; quiet idempotent job creation (expected P2002 absorbed via `ON CONFLICT DO NOTHING`); `ImportReport` contract preserved. No migration, no public-contract break. |

## 3. Current execution pointer

```text
No implementation branch is currently active.

Completed: F1 — Places schema and domain contracts.
Completed: F2 — Geoapify and caption resolution.
Completed: F3 — read API, statistics and review.
Completed: F hardening — pipeline robustness (PR #32).

Phase F is CLOSED (COMPLETE). The pipeline was validated end to end on a real
development environment (real DB, real development Geoapify key, real local JSONL):
real import succeeded, an identical re-import stayed idempotent with no unwanted
duplicates, the expected P2002 no longer appears, transient errors recovered, and
UNKNOWN results were handled correctly. No secret, caption, JSONL or production
data was committed. The Phase F exit gate is explicitly accepted; PILOT_BLOCKED_BY_ENV
no longer applies.

Phase G — Places 2D UI and contextual navigation is IMPLEMENTED and awaiting review
on `claude/phase-g-places-2d-ui` (2D only; no 3D globe, no deep analysis).
```

Active branch:

```text
claude/phase-g-places-2d-ui   (from develop 3927ddb)
```

Owner decisions applied in Phase G: Leaflet as the map engine, Geoapify raster tiles
with mandatory attribution, all places loaded client-side (under ~1000 canonical
places, so no bbox/viewport querying and no map pagination), brunch folded into the
café group until a dedicated source exists, and multi-select filters.

## 4. Merge proof

### F1

- PR: `#29 — feat(places): Phase F1 — domain foundation`;
- reviewed head: `30367b9af8eecfca11b3b9a87823cc371cc6832e`;
- squash merge on `develop`: `8bf8523850688965f993d3e6a805e2c605a13669`;
- CI green and all review threads resolved;
- migration `20260723150157_add_places_domain` recorded on Neon `develop`.

### F2

- PR: `#30 — feat(places): Phase F2 — Geoapify and caption resolution`;
- reviewed head: `655d0e9db2cba2b838258919222aae4fcc67bb4c`;
- squash merge on `develop`: `7cc05e2b7d1f66754d86c0aa6ea8fbb4135fa658`;
- CI run `30053205910` green;
- final suite: 39 files, 278 tests passed, 0 failed;
- stale results are rejected before Geoapify, job creation or persistence;
- no migration or Prisma schema change in F2.

### F3

- PR: `#31 — feat(places): Phase F3 — read API, statistics and review`;
- reviewed head: `96ce34ef89d214cf48d1258313686611f62a0d0d`;
- squash merge on `develop`: `15356e9333dfe84ec1c7a36a14fd1153f82f8c52`;
- CI run `30079965339` / CI #94 completed successfully;
- final review covered `source_theme`, distinct statistics, durable confirmations/rejections, transactionally complete `USER_CORRECTION` evidence, merge-state preservation, audit completeness and exact `(jobId, ownerId, postId)` validation;
- Preview Vercel for the reviewed head was `READY`;
- no migration or Prisma schema change in F3;
- Phase G was not started.

### F hardening

- PR: `#32 — harden(places): resilient Geoapify retries and quiet idempotent jobs`;
- reviewed head: `a62bf573939c9b5d31068c425fc9567bc087ddeb`;
- squash merge on `develop`: `216b97527bc091d6ffe24925ab3463f7d1f0f1c6`;
- CI green (lint, types, unit tests, build) and Browser tests green on the reviewed head;
- retries cover timeouts, network errors and HTTP `408/429/500/502/503/504` with capped exponential backoff, jitter and `Retry-After`; the expected idempotency `P2002` is absorbed at the database level;
- `ImportReport` public contract preserved; no migration or Prisma schema change;
- owner-reported real local rerun (real DB, real development Geoapify key, real JSONL) succeeded and is idempotent; no secret or JSONL committed.

## 5. Phase F contracts

The reviewed design is `CODEX_PHASE_F_METADATA_FIRST_DESIGN.md` and the task plan is `docs/superpowers/plans/2026-07-23-phase-f-metadata-first.md`.

Signed-off decisions:

1. Geoapify is the geographic resolver behind `PlaceResolver`.
2. Claude/Codex output textual candidates only; models never provide coordinates.
3. Caption analysis uses the local JSONL export/import workflow until the VPS exists.
4. Each candidate batch is bound to immutable `input_hash` and `analysis_version` values.
5. Stale imports are rejected before any provider call or database write.
6. `UNKNOWN` creates no Place row.
7. `EXACT`, `PROBABLE` and `APPROXIMATE` use deterministic semantics.
8. `PostPlace` stores one canonical link; repeated mentions live in evidence.
9. Places lists use opaque cursor pagination.
10. The Phase D external API key remains read-only.
11. Human review actions require a bounded actor and reason and are audited atomically.
12. Audit jobs must match the exact `(jobId, ownerId, postId)` tuple.
13. `source_theme` statistics use `Post.mainTheme`, never collections.
14. `PLACES_ENABLED=1` requires a valid server-only Geoapify configuration at preflight.

## 6. Environment and deployment state

### Vercel

| Environment | Git branch | State |
| --- | --- | --- |
| Production | `main` | Correctly tracked. Production remains isolated from `develop`. |
| Preview development | `develop` | PR #31 merge triggers a Preview deployment through the stable `git-develop` alias. |

Stable URLs:

```text
Production: https://insta-saved-post-explorer.vercel.app
Develop:    https://insta-saved-post-explorer-git-develop-l1nk4r1ms-projects.vercel.app
```

### Neon

Project: `fancy-mud-69762258`

| Environment | Neon branch | Verified schema state |
| --- | --- | --- |
| Production | `main` / `br-super-snow-asyrmnbm` | Phase C migration applied and recorded. F1 remains intentionally unpromoted. |
| Development | `develop` / `br-sparkling-glade-as9gow4m` | Phase C and F1 migrations applied and recorded. F2 and F3 require no migration. |

Do not run `prisma migrate dev`, `prisma db push` or seeds against either deployed database.

## 7. Phase F exit gate — accepted

The controlled Geoapify validation was executed on a real development environment
and the Phase F exit gate is **accepted**. Recorded evidence (owner-reported real
local validation; the cloud session cannot reach the real DB, key or JSONL and did
not run the real import):

- F1, F2, F3 and the F hardening (PR #32) are merged on `develop`;
- cloud validation green (lint, typecheck, tests, build, targeted e2e) with Geoapify fully mocked;
- real local validation succeeded: `PLACES_ENABLED=1` with a development-only `GEOAPIFY_API_KEY`, real DB, real local JSONL;
- real import succeeded; an identical re-import stayed **idempotent** with no unwanted `Place`, `PostPlace`, `PlaceEvidence` or `PlaceAnalysisJob` duplicates;
- the expected, noisy `P2002` no longer appears in the logs;
- Geoapify retry behaviour validated; transient errors recovered;
- `UNKNOWN` results handled correctly (no canonical place, evidence kept);
- `Place` / `PostPlace` / `PlaceEvidence` persistence coherent;
- no additional migration required; no public-contract break; no functional regression;
- no secret, caption, candidate JSONL or production data committed.

`PILOT_BLOCKED_BY_ENV` no longer applies and has been removed from the active docs.

### Exact next action — Phase G kickoff (do not start UI here)

1. Wait for an explicit Phase G implementation prompt.
2. Create the dedicated branch `claude/phase-g-places-2d-ui`, reset from the latest `develop`.
3. Follow the Phase G source of truth: `docs/phase-g-places-2d-ui-brief.md` (entry brief), which defers to `CODEX_IMPLEMENTATION_ORDER.md` §5 Phase G and `CODEX_PLACES_EXTENSION.md` §13–§14 as the authoritative contract.
4. Resolve the open product decisions (map library, tile provider, cluster behaviour, viewport limits, display thresholds, final design) with the owner before implementation — do not guess them.
5. Reuse the existing read-only `/api/v1/places*` routes and server query/stats/review services; no direct Prisma in components, no internal HTTP loop from Server Components.

## 8. Phase state

| Phase | State | Reason |
| --- | --- | --- |
| C — R2 media identity and worker isolation | COMPLETE | PR #24; migration applied to Neon `main` and `develop`. |
| D — External API V1 | COMPLETE | PR #26. Distributed rate limiting remains deferred. |
| E — Global worker foundation | READY, separate | Requires VPS decisions. Do not mix with the pilot or Phase G. |
| F1 — Places schema and domain contracts | COMPLETE | PR #29, squash `8bf8523`; migration verified on Neon `develop`. |
| F2 — Geoapify and caption resolution | COMPLETE | PR #30, squash `7cc05e2`; hardened by PR #32, squash `216b975`. CI green, no migration required. |
| F3 — Read API, statistics and review | COMPLETE | PR #31, squash `15356e9`; CI #94 green, Preview ready, no migration. |
| F — Places metadata-first domain | COMPLETE | All sub-phases and the F hardening (PR #32) merged; exit gate accepted via successful real local validation (idempotent import, no expected P2002, transient-error recovery, `UNKNOWN` handled). No further migration. |
| G — Places 2D UI | AWAITING_REVIEW | Implemented on `claude/phase-g-places-2d-ui`: `/places`, Leaflet map with clustering, hover callout, detail sheet, synchronized list, filters behind one button, theme/country statistics, review via internal Server Actions, deep links, responsive and accessible. Additive read-only API filters; no migration. See `places-ui.md`. |
| H — Deep Places analysis | BLOCKED | Requires C, E and stable F. |
| I — Places 3D globe | BLOCKED | Requires G and stable Places data. |
| J — Unified MCP and Hermes | BLOCKED | Places tools require complete Phase F. |

## 9. Open decisions that must not be guessed

Resolved since the last handoff: the controlled Geoapify validation environment and
key ownership (a development-only key was used for the accepted real local validation).

Still open (must not be guessed):

- Phase G product decisions are RESOLVED (Leaflet, Geoapify raster tiles, client-side clustering with no viewport querying, Apple-Plans-inspired minimal design). Still open for a later iteration: a dedicated source for brunch (currently folded into café);
- distributed API rate limiting on Vercel;
- 3D globe rendering provider for Phase I;
- server-side AI providers, models, budgets and escalation thresholds for Phase H;
- VPS credentials, firewall, backups and observability for Phase E;
- final confirmation model for sensitive Phase G/J commands.

## 10. Phase F exit-gate decision — recorded

The Phase F exit gate was accepted on the basis of a successful real local validation
(see §7). The decision was made against these criteria, all confirmed by the owner:

```text
Final Phase F gate decision  : ACCEPTED (Phase F COMPLETE, Phase G READY)
Environment used             : real development environment (names only, no secrets)
Real import                  : succeeded
Re-import of the same batch   : succeeded, idempotent, no unwanted duplicates
Expected P2002               : no longer observed in the logs
Geoapify retries             : validated; transient errors recovered
UNKNOWN handling             : correct (no canonical place, evidence kept)
Persistence                  : Place / PostPlace / PlaceEvidence coherent
Migration required           : none
Public-contract break        : none
Sensitive data committed     : none (no captions, JSONL, keys, OAuth or production data)
```

A separate numeric aggregate pilot report (per-theme counts, provider-call averages)
was not transmitted to this session; the owner accepted the exit gate on the
qualitative real-validation checklist above. If a numeric aggregate is later
required for the record, it can be produced from a real run — never fabricated, and
never with captions, candidate JSONL, API keys, OAuth credentials, database URLs or
production data committed.