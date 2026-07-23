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

## 3. Active Phase

```text
Phase C — R2 media identity and worker isolation
Status: AWAITING_REVIEW
Branch: claude/insta-saved-post-explorer-continue-wli2my
Pull request: #24 (base develop)
```

Phase C is implemented and awaiting review. Its design (with owner decisions
D1–D4) is `CODEX_R2_WORKER_ISOLATION_DESIGN.md`. Do not start Phase D, E, F, G,
H, I, or J before PR #24 is reviewed and merged.

Branch divergence note: `CODEX_IMPLEMENTATION_ORDER.md` recommends per-phase branch names (`feat/places-theme-eligibility`, etc.). The Claude sessions were constrained to the branch `claude/insta-saved-post-explorer-continue-wli2my` (restarted from the merged `develop` for each phase). Codex had not started any of these phases, so no work was duplicated.

### 3.1 Session Handoff

```text
Date et agent : 23 juillet 2026, Claude (Claude Code)
Phase active : C — R2 media identity and worker isolation
Statut : AWAITING_REVIEW
Branche : claude/insta-saved-post-explorer-continue-wli2my (repartie de develop 1b5fa16)
Pull request : #24
Dernier commit develop : 1b5fa16

Travail reçu de Codex :
- develop à 1b5fa16 ; design Phase C validé (CODEX_R2_WORKER_ISOLATION_DESIGN.md,
  décisions D1–D4) mergé en PR #23. Aucune implémentation Phase C préalable.

Travail réalisé par Claude (implémentation Phase C) :
- migration additive 20260723120000_add_media_identity_and_worker_role :
  enum MediaIdentity (UNVERIFIED/REPAIRABLE/VERIFIED), colonnes d'identité sur
  post_media (owner_id, object_key, mime_type, byte_size, version_tag,
  identity_state, checked_at), backfill owner_id depuis posts puis NOT NULL,
  index (owner_id, identity_state), rôle restreint ipe_worker_reader NOLOGIN
  avec GRANT SELECT sur les seules colonnes d'identité ;
- persistance de l'identité R2 vérifiée dans le chemin sync
  (src/server/media-identity.ts + branchement dans /api/sync/posts) : les objets
  vérifiés passent VERIFIED ; l'import JSON reste UNVERIFIED avec owner_id ;
- backfillMediaIdentity() idempotent (D3) + helper headR2Object() dans r2.ts ;
- env/docs : R2_WORKER_* et WORKER_DATABASE_URL dans .env.example,
  provisionnement du rôle documenté dans docs/deployment.md ;
- tests PostgreSQL tests/unit/media-identity-postgres.test.ts (6) : isolation
  propriétaire, persistance sync, transitions VERIFIED/REPAIRABLE/UNVERIFIED,
  import UNVERIFIED, permissions du rôle restreint (SET LOCAL ROLE).

Écart mineur assumé vs design : le NOT NULL de owner_id est appliqué dans la même
migration additive (après backfill), pas en migration de suivi séparée — la table
est petite et le backfill précède la contrainte, donc l'objectif de sécurité du
two-step est conservé. Documenté dans la PR.

Vérifications finales (local, PostgreSQL 16) :
- npm run lint : OK (0 warning) · npm run typecheck : OK · npm run build : OK ;
- TEST_DATABASE_URL=<pg16> npm run test : 26 fichiers / 143 tests ;
- npm run test sans base : 121 passés + 22 skippés ;
- migrate deploy sur base vierge : OK (colonnes + rôle présents) ;
- db:seed sur base vierge : 18 médias, owner_id renseigné, identity_state UNVERIFIED.

Prochaine action exacte pour Codex :
- relire la PR #24 (migration, src/server/media-identity.ts, r2.ts, route sync,
  import-posts, seed, tests) et la merger si conforme ;
- ne démarrer la Phase D (API externe V1) ou la Phase E (worker global) qu'après
  ce merge ; la Phase E réutilisera le rôle ipe_worker_reader (étendre ses GRANT
  à la future table de jobs) et l'état identity_state ;
- tout futur consommateur Places doit importer isPlacesEligibleTheme() depuis
  src/lib/places/eligibility.ts, jamais recopier les chaînes de thème.

Question produit ouverte (consignée dans la PR #21) :
- le bouton « Découverte » est desktop-only ; son test e2e est skippé sur mobile.
  À trancher : faut-il l'exposer au mobile ? (hors périmètre des phases en cours.)

Blocages et risques :
- le rôle ipe_worker_reader est créé NOLOGIN sans mot de passe ; un rôle de
  connexion héritant du rôle et le credential R2 worker doivent être provisionnés
  hors dépôt avant la Phase E (voir docs/deployment.md). Rien de bloquant pour la revue.
```

## 4. Phase B Contract Summary

The merged contract lives in `src/lib/places/eligibility.ts`:

- `PLACES_ELIGIBLE_THEMES = ["Voyages", "Restaurant"]` is the single canonical constant;
- `isPlacesEligibleTheme(mainTheme)` folds the input with the shared `foldForSearch()` and compares against the folded canonical set;
- `null`, empty, whitespace-only, neighboring (`Voyage`, `Restaurants`, `Cuisine`, ...) and compound themes are not eligible;
- no collection, tag, slug, or Instagram provenance is ever consulted;
- switching a post to an eligible theme makes it a candidate for an idempotent metadata-first job; switching away blocks future automatic analyses but never silently deletes confirmed places or existing links.

Every future entry point (services, jobs, statistics, UI actions, worker handler, MCP tools) must reuse this predicate.

## 5. CI and Environment State

- **`develop` CI is fully green** as of `1b5fa16`: `Lint, types, unit tests and build` and `Browser tests` both pass. The `Browser tests` job had been red since 14 July 2026 (18 identical failures); this was diagnosed in issue #20 and fixed by PR #21 (real CSS ribbon-overflow regression + e2e spec realignment). Issue #20 is closed.
- Vercel preview deployments now succeed: `AUTH_SECRET` was added to the Vercel Preview environment by the owner. (The variable had previously only existed in Production, which failed `deploy:check` on previews.)
- Open product question (recorded in PR #21): the `Découverte` button is desktop-only; its e2e test is skipped on mobile viewports. Decide whether to expose discovery on mobile — no code change was made for it here.

## 6. Blocked Later Phases

| Phase | State | Reason |
| --- | --- | --- |
| C — R2 media identity and worker isolation | Awaiting review | Implemented in PR #24 (migration + identity persistence + restricted role + backfill + tests). Design: `CODEX_R2_WORKER_ISOLATION_DESIGN.md`. |
| D — External API V1 | Blocked | Requires Phase A (merged) and the prerequisites defined by the implementation order |
| E — Global worker foundation | Blocked | Requires Phase C |
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
