# Operational Handoff

Last updated: 24 July 2026  
Repository: `L1nK4R1M/insta-saved-post-explorer`  
Reference branch: `develop`  
Reference implementation commit: `7cc05e2b7d1f66754d86c0aa6ea8fbb4135fa658`

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

## 3. Current execution pointer

```text
No implementation branch is currently active.

Completed: F1 — Places schema and domain contracts.
Completed: F2 — Geoapify and caption resolution.
Next executable sub-phase: F3 — read API, statistics and review.

F3 may start only from the latest develop.
Phase G and later phases remain blocked until F3 is reviewed and merged.
```

Claude branch constraint:

```text
claude/insta-saved-post-explorer-continue-wli2my
```

Reset that branch from the latest `develop` before starting F3. Never continue from the old F2 head.

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
- final P1 fixed by propagating `input_hash` and `analysis_version` through JSONL and rejecting stale results before Geoapify, job creation or persistence;
- no migration or Prisma schema change in F2;
- F3 and Phase G were not started.

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

## 6. Environment and deployment state

### Vercel

| Environment | Git branch | State |
| --- | --- | --- |
| Production | `main` | Correctly tracked. Production remains isolated from `develop`. |
| Preview development | `develop` | F2 merge triggers a Preview deployment through the stable `git-develop` alias. |

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
| Development | `develop` / `br-sparkling-glade-as9gow4m` | Phase C and F1 migrations applied and recorded. F2 requires no migration. |

Do not run `prisma migrate dev`, `prisma db push` or seeds against either deployed database.

## 7. Exact next action for F3

1. Reset the Claude branch from the latest `develop` at or after `7cc05e2`.
2. Read `AGENTS.md`, this handoff, `CODEX_PLACES_EXTENSION.md`, the Phase F design and the Phase F plan.
3. Implement only F3: read-only Places API, cursor queries, distinct statistics, and internal review/merge services.
4. Reuse Phase D authentication and keep the external API read-only.
5. Write failing API and PostgreSQL tests before implementation.
6. Open an F3 PR against `develop` and stop.
7. Do not start Phase G, UI, map, worker deployment, video analysis or MCP integration.

## 8. Phase state

| Phase | State | Reason |
| --- | --- | --- |
| C — R2 media identity and worker isolation | COMPLETE | PR #24; migration applied to Neon `main` and `develop`. |
| D — External API V1 | COMPLETE | PR #26. Distributed rate limiting remains deferred. |
| E — Global worker foundation | READY, separate | Requires VPS decisions. Do not mix with F3. |
| F1 — Places schema and domain contracts | COMPLETE | PR #29, squash `8bf8523`; migration verified on Neon `develop`. |
| F2 — Geoapify and caption resolution | COMPLETE | PR #30, squash `7cc05e2`; CI green, no migration required. |
| F3 — Read API, statistics and review | READY | F2 is reviewed and merged. |
| G — Places 2D UI | BLOCKED | Requires complete Phase F. |
| H — Deep Places analysis | BLOCKED | Requires C, E and stable F. |
| I — Places 3D globe | BLOCKED | Requires G and stable Places data. |
| J — Unified MCP and Hermes | BLOCKED | Places tools require complete Phase F. |

## 9. Open decisions that must not be guessed

- distributed API rate limiting on Vercel;
- map rendering provider for Phase G/I;
- server-side AI providers, models, budgets and escalation thresholds for Phase H;
- VPS credentials, firewall, backups and observability for Phase E;
- final confirmation model for sensitive Phase G/J commands.

## 10. Required pull-request report

Every F3 PR must include:

```text
Phase active
Sub-phase active
Gate d’entrée vérifiée
Fichiers modifiés
Contrats ajoutés ou modifiés
Migrations
Tests ajoutés
Commandes exécutées
Résultats
Risques restants
Prochaine gate
```

Every Phase F PR must explicitly confirm that it did not start another phase and did not commit captions, candidate JSONL, API keys, OAuth credentials or production data.
