# Operational Handoff

Last updated: 24 July 2026  
Repository: `L1nK4R1M/insta-saved-post-explorer`  
Reference branch: `develop`  
Reference implementation commit: `8bf8523850688965f993d3e6a805e2c605a13669`

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

## 3. Current execution pointer

```text
No implementation branch is currently active.

Completed: F1 — Places schema and domain contracts.
Next executable sub-phase: F2 — Geoapify and caption resolution.

F2 may start only from the latest develop.
F3 remains blocked until F2 is independently reviewed and merged.
Phase G and later phases remain blocked.
```

Claude branch constraint:

```text
claude/insta-saved-post-explorer-continue-wli2my
```

Reset that branch from the latest `develop` before starting F2. Never continue from the old F1 head.

## 4. F1 merge proof

- PR: `#29 — feat(places): Phase F1 — domain foundation`;
- reviewed head: `30367b9af8eecfca11b3b9a87823cc371cc6832e`;
- squash merge on `develop`: `8bf8523850688965f993d3e6a805e2c605a13669`;
- all five review threads resolved;
- CI run `30039246655` green;
- lint, typecheck, unit tests, PostgreSQL migration tests, production build and Playwright green;
- final regression filters internal tags by `tag.ownerId` inside the Prisma query;
- F2 and F3 were not started in the F1 PR.

F1 migration:

```text
20260723150157_add_places_domain
```

The migration is additive and creates:

- `places`;
- `post_places`;
- `place_evidence`;
- `place_analysis_jobs`;
- owner/post consistency constraints;
- deterministic precision and confidence checks;
- one-primary-place-per-owner-and-post enforcement;
- idempotent job identity.

## 5. Phase F contracts

The reviewed design is `CODEX_PHASE_F_METADATA_FIRST_DESIGN.md` and the task plan is `docs/superpowers/plans/2026-07-23-phase-f-metadata-first.md`.

The following decisions are signed off:

1. Geoapify is the geographic resolver behind the replaceable `PlaceResolver` interface.
2. Claude/Codex output textual candidates only; models never provide coordinates.
3. Caption analysis uses the local JSONL export/import workflow until the VPS exists.
4. `UNKNOWN` creates no Place row.
5. `EXACT`, `PROBABLE` and `APPROXIMATE` use deterministic semantics.
6. `PostPlace` stores one canonical link; repeated mentions live in evidence.
7. Places lists use opaque cursor pagination.
8. The Phase D external API key remains read-only.
9. F2 must not add map UI, video analysis, OCR, transcription, a VPS worker or MCP tools.

## 6. Environment and deployment state

### Vercel

| Environment | Git branch | State |
| --- | --- | --- |
| Production | `main` | Correctly tracked. Deployment `dpl_6SKurYWWoDNb9f6NUc4DiKuYxv2n` is READY. |
| Preview development | `develop` | Deployment `dpl_BJRn46imBGcS1MmtGVMPaFnnTUye` for commit `8bf8523` is READY and has the stable `git-develop` alias. |

Stable URLs:

```text
Production: https://insta-saved-post-explorer.vercel.app
Develop:    https://insta-saved-post-explorer-git-develop-l1nk4r1ms-projects.vercel.app
```

The Preview is protected by Vercel authentication. A smoke test must use an authenticated browser/session or an approved temporary share link.

### Neon

Project: `fancy-mud-69762258`

| Environment | Neon branch | Verified schema state |
| --- | --- | --- |
| Production | `main` / `br-super-snow-asyrmnbm` | Phase C migration applied and recorded. Production API returns `totalLibrary: 3417`. F1 is intentionally not promoted yet. |
| Development | `develop` / `br-sparkling-glade-as9gow4m` | Phase C and F1 migrations applied and recorded. All four Places tables exist. Initial Places count is `0`. |

Recorded migrations added during the environment repair:

```text
20260723120000_add_media_identity_and_worker_role
20260723150157_add_places_domain  # develop only until release promotion
```

Do not run `prisma migrate dev`, `prisma db push` or seeds against either deployed database. Future releases must use `prisma migrate deploy` or the documented controlled release workflow.

## 7. Exact next action for F2

1. Reset the Claude branch from `develop` at or after `8bf8523`.
2. Read `AGENTS.md`, this handoff, `CODEX_PLACES_EXTENSION.md`, the Phase F design and the Phase F plan.
3. Implement only F2: Geoapify resolver, deterministic scoring, caption candidate ingestion and atomic persistence.
4. Keep `GEOAPIFY_API_KEY` server-only and never prefix it with `NEXT_PUBLIC_`.
5. Write failing tests before implementation.
6. Open an F2 PR against `develop` and stop.
7. Do not start F3, UI, map, video processing, worker deployment or MCP integration.

## 8. Phase state

| Phase | State | Reason |
| --- | --- | --- |
| C — R2 media identity and worker isolation | COMPLETE | PR #24; migration now applied to Neon `main` and `develop`. |
| D — External API V1 | COMPLETE | PR #26. Distributed rate limiting remains deferred. |
| E — Global worker foundation | READY, separate | Requires VPS decisions. Do not mix with F2. |
| F1 — Places schema and domain contracts | COMPLETE | PR #29, squash `8bf8523`; migration verified on Neon `develop`. |
| F2 — Geoapify and caption resolution | READY | F1 is merged and the development database is prepared. |
| F3 — Read API, statistics and review | BLOCKED | Requires F2 merge. |
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

Every F2/F3 PR must include:

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