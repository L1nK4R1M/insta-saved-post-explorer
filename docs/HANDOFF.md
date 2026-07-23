# Operational Handoff

Last updated: 23 July 2026  
Repository: `L1nK4R1M/insta-saved-post-explorer`  
Reference branch: `develop`  
Reference commit (latest `develop`): `1b5fa1695bb61c3f5b86dbb6a763895d2c0b3dbd`

## 1. Purpose

This file describes the current operational state for the next agent session. It does not replace the architecture, product contracts, or phase gates.

Authority order:

1. `../AGENTS.md` for global rules and prohibitions;
2. this file for the current active phase and handoff state;
3. `CODEX_IMPLEMENTATION_ORDER.md` for phase order, per-phase scope, and dependencies;
4. the implementation brief for the active phase;
5. the code and existing repository conventions.

If this handoff conflicts with an authoritative contract or with the code observed on the latest `develop`, stop and document the conflict before editing.

## 2. Completed Work

| Phase | Outcome |
| --- | --- |
| 0 — API and Places audit | Documentation merged (PR #15). Architecture locked: one app, one PostgreSQL, one R2, one global worker, one global MCP; Places eligibility from `Post.mainTheme` (`Voyages`, `Restaurant`) only, no `Lieux` collection dependency. |
| A — Library filter consistency | Merged into `develop` (PR #18, squash `69ea0da`). Shared predicates `libraryPostWhere()` and `relevanceFilter()` in `src/server/library.ts`; author, year, and collection now apply to every list, count, and random path. Two latent relevance-SQL type-binding defects fixed (`make_date` bigint parameter, 16-digit numeric cursor precision). 16 PostgreSQL regressions added in `tests/unit/library-filters-postgres.test.ts`, gated on `TEST_DATABASE_URL`. |
| B — Places theme eligibility | Merged into `develop` (PR #19, squash `2323e0d`). `PLACES_ELIGIBLE_THEMES` + `isPlacesEligibleTheme()` in `src/lib/places/eligibility.ts`, reusing `foldForSearch()`; 8 unit tests in `tests/unit/places-eligibility.test.ts`. Contract summary in section 4. |
| E2e suite re-green | Merged into `develop` (PR #21, squash `1b5fa16`, closes issue #20). Fixed a real CSS ribbon-overflow regression and realigned the library/toolbar e2e specs with the mid-July UI. **`develop` CI is now fully green** (`Browser tests` included) for the first time since 14 July 2026. Not a numbered phase. |
| C — R2 media identity and worker isolation | Design merged (PR #23, `cb2bb26`, `CODEX_R2_WORKER_ISOLATION_DESIGN.md`, decisions D1–D4). Implementation merged (PR #24, squash `0870d69`): additive migration (`MediaIdentity` enum + identity columns on `post_media` + `owner_id` backfill/NOT NULL + index + restricted `ipe_worker_reader` role), verified R2 identity persisted in the sync path (`src/server/media-identity.ts`), idempotent `backfillMediaIdentity`, `headR2Object` helper, worker credential docs, 6 PostgreSQL tests. Contract summary in section 4bis. |

## 3. Active Phase

```text
No implementation phase is active.
Phases 0, A, B, C are merged. develop CI green as of the Phase C merge (0870d69).
Next executable phase: D — External API V1 (brief: CODEX_API_READY_ARCHITECTURE.md).
Phase E (global worker) is also unblocked and reuses the ipe_worker_reader role
from Phase C, but depends on VPS decisions not yet taken (section 7).
Branch for the next work: claude/insta-saved-post-explorer-continue-wli2my
(restart from the latest develop for each new unit of work).
```

Do not start a later phase in a way that bundles it with another; each phase is
one dedicated PR that stops for review at its exit gate.

Branch divergence note: `CODEX_IMPLEMENTATION_ORDER.md` recommends per-phase branch names (`feat/places-theme-eligibility`, etc.). The Claude sessions were constrained to the branch `claude/insta-saved-post-explorer-continue-wli2my` (restarted from the merged `develop` for each phase). Codex had not started any of these phases, so no work was duplicated.

### 3.1 Session Handoff

```text
Date et agent : 23 juillet 2026, Claude (Claude Code)
Phase active : aucune (0, A, B, C mergées)
Statut : develop stable, CI verte (dernier merge Phase C 0870d69)
Branche : claude/insta-saved-post-explorer-continue-wli2my (repartie de develop 0870d69)
Dernier commit develop : 0870d69

Travail réalisé par Claude durant la session :
- Phase A mergée (PR #18) ; Phase B mergée (PR #19) ;
- diagnostic + remise au vert e2e mergée (PR #21, closes issue #20) ;
- design Phase C mergé (PR #23, décisions D1–D4) ;
- implémentation Phase C mergée (PR #24, squash 0870d69) : migration additive
  (enum MediaIdentity, colonnes d'identité sur post_media, backfill owner_id +
  NOT NULL, index, rôle restreint ipe_worker_reader NOLOGIN), persistance de
  l'identité R2 vérifiée dans le chemin sync, backfillMediaIdentity() idempotent,
  headR2Object(), env/docs credentials worker, 6 tests PostgreSQL.

Prochaine action exacte pour Codex :
- il n'y a rien à merger ni corriger sur develop ;
- Phase D (API externe V1) est la prochaine phase autonome : suivre
  CODEX_API_READY_ARCHITECTURE.md, brancher /api/v1 comme adaptateurs fins sur les
  services serveur existants, auth Bearer SHA-256 (EXTERNAL_API_KEY_SHA256),
  erreurs stables, tests, sans casser les routes historiques. Décision ouverte à
  trancher avant exposition : rate-limiting distribué sur Vercel (section 7) ;
- Phase E (worker global) est aussi débloquée et réutilise ipe_worker_reader +
  identity_state, mais dépend de décisions VPS non prises (section 7) ;
- tout futur consommateur Places doit importer isPlacesEligibleTheme() depuis
  src/lib/places/eligibility.ts, jamais recopier les chaînes de thème.

Question produit ouverte (consignée dans la PR #21) :
- le bouton « Découverte » est desktop-only ; son test e2e est skippé sur mobile.
  À trancher : faut-il l'exposer au mobile ? (hors périmètre des phases en cours.)

Blocages et risques :
- rappel Phase C : ipe_worker_reader est NOLOGIN sans mot de passe ; un rôle de
  connexion héritant du rôle et le credential R2 worker restent à provisionner
  hors dépôt avant la Phase E (voir docs/deployment.md).
```

## 4. Phase B Contract Summary

The merged contract lives in `src/lib/places/eligibility.ts`:

- `PLACES_ELIGIBLE_THEMES = ["Voyages", "Restaurant"]` is the single canonical constant;
- `isPlacesEligibleTheme(mainTheme)` folds the input with the shared `foldForSearch()` and compares against the folded canonical set;
- `null`, empty, whitespace-only, neighboring (`Voyage`, `Restaurants`, `Cuisine`, ...) and compound themes are not eligible;
- no collection, tag, slug, or Instagram provenance is ever consulted;
- switching a post to an eligible theme makes it a candidate for an idempotent metadata-first job; switching away blocks future automatic analyses but never silently deletes confirmed places or existing links.

Every future entry point (services, jobs, statistics, UI actions, worker handler, MCP tools) must reuse this predicate.

## 4bis. Phase C Contract Summary

The merged Phase C contract (design: `CODEX_R2_WORKER_ISOLATION_DESIGN.md`):

- `PostMedia` now carries an authoritative R2 identity: `objectKey`, `mimeType`, `byteSize`, `versionTag` (opaque R2 ETag), `identityState` (`UNVERIFIED`/`REPAIRABLE`/`VERIFIED`), `checkedAt`, plus a denormalized `ownerId`;
- the sync path persists the identity it verifies and promotes those rows to `VERIFIED` (`persistVerifiedMediaIdentity` in `src/server/media-identity.ts`); JSON imports and the seed stay `UNVERIFIED`;
- `backfillMediaIdentity()` is the idempotent maintenance step: present → `VERIFIED`, absent-but-derivable → `REPAIRABLE`, keyless → `UNVERIFIED`; identity is never fabricated;
- the restricted role `ipe_worker_reader` (NOLOGIN) has `SELECT` on the media identity columns only — never `url`/`source_path`/`thumbnail_url`, never another table, never writes. Phase E extends its grants to the future jobs table and provisions a login role out-of-band;
- the worker resolves an object only as `objectKey` on a `VERIFIED` row; it never dereferences a URL.

## 5. CI and Environment State

- **`develop` CI is fully green** as of `1b5fa16`: `Lint, types, unit tests and build` and `Browser tests` both pass. The `Browser tests` job had been red since 14 July 2026 (18 identical failures); this was diagnosed in issue #20 and fixed by PR #21 (real CSS ribbon-overflow regression + e2e spec realignment). Issue #20 is closed.
- Vercel preview deployments now succeed: `AUTH_SECRET` was added to the Vercel Preview environment by the owner. (The variable had previously only existed in Production, which failed `deploy:check` on previews.)
- Open product question (recorded in PR #21): the `Découverte` button is desktop-only; its e2e test is skipped on mobile viewports. Decide whether to expose discovery on mobile — no code change was made for it here.

## 6. Later Phases

| Phase | State | Reason |
| --- | --- | --- |
| C — R2 media identity and worker isolation | Merged | PR #24 (`0870d69`). Contract summary in section 4bis. |
| D — External API V1 | Next executable | Phase A merged; brief `CODEX_API_READY_ARCHITECTURE.md`. Open decision: distributed rate limiting on Vercel (section 7). |
| E — Global worker foundation | Unblocked | Phase C merged; reuses `ipe_worker_reader` + `identityState`. Depends on VPS decisions not yet taken (section 7). |
| F — Places metadata-first domain | Blocked | Requires Phases B and D and relevant worker/data gates |
| G — Places 2D UI | Blocked | Requires Phase F |
| H — Deep video analysis | Blocked | Requires Phases C and E, stable Places domain |
| I — 3D globe | Blocked | Requires Phase G and stable Places data |
| J — MCP and Hermes | Blocked | Requires Phase D; Places tools also require Phase F |

The presence of a detailed brief is not permission to execute a blocked phase.

## 7. Decisions That Must Not Be Guessed

Still open (require an explicit decision at the relevant later phase):

- distributed API rate limiting on Vercel;
- map rendering provider;
- geographic resolution provider;
- AI providers, models, budgets, and thresholds;
- VPS credentials, firewall, backups, and observability;
- permissions and confirmation model for sensitive Places commands.

Signed off for Phase C (23 July 2026, owner) — see `CODEX_R2_WORKER_ISOLATION_DESIGN.md` section 8:

- canonical R2 media identity and historical repair policy → authoritative `objectKey` + `mimeType` + `byteSize` + opaque R2 ETag version tag + `identityState` (UNVERIFIED/REPAIRABLE/VERIFIED); legacy media stays flagged with lazy backfill, never fabricated;
- restricted PostgreSQL worker role → restricted read-only role, owner isolation enforced by grant + query discipline + owner-scoped test (RLS deferred);
- migration rollback or forward-recovery procedure → additive migration, fix-forward, Neon branch/PITR as the safety net.

## 8. Required Pull Request Report

Every phase implementation pull request must include:

```text
Phase active
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
