# Operational Handoff

Last updated: 23 July 2026  
Repository: `L1nK4R1M/insta-saved-post-explorer`  
Reference branch: `develop`  
Reference commit before this change: `69ea0da68c2dce429cc37fd92bb643bc5809ca25`

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

## 3. Active Phase

```text
Phase B — Contrat d'éligibilité Places par thème
Status: AWAITING_REVIEW
Branch: claude/insta-saved-post-explorer-continue-wli2my
Pull request: #19 (base develop)
```

Phase B is implemented and awaiting review. Do not start Phase C, D, E, F, G, H, I, or J before PR #19 is reviewed and merged, and never in the same branch or pull request.

Branch divergence note: `CODEX_IMPLEMENTATION_ORDER.md` recommends `feat/places-theme-eligibility`. The Claude sessions implementing Phases A and B were constrained to the branch `claude/insta-saved-post-explorer-continue-wli2my` (restarted from the merged `develop` for each phase); Codex had not started either phase, so no work was duplicated.

### 3.1 Session Handoff

```text
Date et agent : 23 juillet 2026, Claude (Claude Code)
Phase active : B — Places theme eligibility
Statut : AWAITING_REVIEW
Branche : claude/insta-saved-post-explorer-continue-wli2my
Pull request : #19
Dernier commit poussé : voir la branche (feat + docs)

Travail reçu de Codex :
- develop à 69ea0da (Phase A mergée) ; aucune implémentation Phase B préalable.

Travail réalisé par Claude :
- merge de la PR #18 (Phase A) sur demande explicite du propriétaire, après
  vérification que l'échec CI « Browser tests » est préexistant sur develop
  (mêmes 18 tests Playwright en échec sur develop@9891dfd, rouge depuis le
  14 juillet ; constat documenté dans la PR #18) ;
- création de src/lib/places/eligibility.ts : PLACES_ELIGIBLE_THEMES
  (constante canonique unique) et isPlacesEligibleTheme() réutilisant
  foldForSearch() ; comportement au changement de thème documenté ;
- création de tests/unit/places-eligibility.test.ts (8 tests purs couvrant
  le contrat positif et négatif exact du brief Places §3.2).

Fichiers modifiés :
- src/lib/places/eligibility.ts (nouveau)
- tests/unit/places-eligibility.test.ts (nouveau)
- docs/HANDOFF.md, docs/IMPLEMENTATION_STATUS.md

Tests exécutés :
- npm run lint : OK, 0 warning
- npm run typecheck : OK
- npx vitest run tests/unit/places-eligibility.test.ts : 8/8
- TEST_DATABASE_URL=<pg16> npm run test : OK, 25 fichiers / 137 tests
- npm run test sans base : OK, 121 passés + 16 skippés
- npm run build : OK, 22 pages

Échecs ou validations restantes :
- aucun échec local ; CI « Browser tests » attendue rouge (échec préexistant
  develop, voir section 5).

Travail restant :
- revue humaine et merge de la PR #19 ;
- après merge, passer Phase B à COMPLETE dans IMPLEMENTATION_STATUS.md.

Prochaine action exacte pour Codex :
- relire la PR #19 (src/lib/places/eligibility.ts,
  tests/unit/places-eligibility.test.ts) et la merger si conforme ;
- ne démarrer la Phase C (identité média R2, design et revue de migration
  dédiés) qu'après ce merge, ou traiter d'abord la remise au vert de la
  suite e2e (section 5) comme chantier séparé ;
- tout futur consommateur Places (service, job, statistique, action UI,
  worker, MCP) doit importer isPlacesEligibleTheme() depuis
  src/lib/places/eligibility.ts, jamais recopier les chaînes de thème.

Blocages et risques :
- CI « Browser tests » rouge sur develop depuis le 14 juillet (voir section 5) ;
- previews Vercel en échec : AUTH_SECRET absent de l'environnement Preview du
  projet Vercel (action propriétaire, hors dépôt).
```

## 4. Phase B Contract Summary

The merged contract lives in `src/lib/places/eligibility.ts`:

- `PLACES_ELIGIBLE_THEMES = ["Voyages", "Restaurant"]` is the single canonical constant;
- `isPlacesEligibleTheme(mainTheme)` folds the input with the shared `foldForSearch()` and compares against the folded canonical set;
- `null`, empty, whitespace-only, neighboring (`Voyage`, `Restaurants`, `Cuisine`, ...) and compound themes are not eligible;
- no collection, tag, slug, or Instagram provenance is ever consulted;
- switching a post to an eligible theme makes it a candidate for an idempotent metadata-first job; switching away blocks future automatic analyses but never silently deletes confirmed places or existing links.

Every future entry point (services, jobs, statistics, UI actions, worker handler, MCP tools) must reuse this predicate.

## 5. Known Pre-existing Failures

- The `Browser tests` CI job (Playwright) had been failing on `develop` since 14 July 2026 (18 identical failures per run). Diagnosis: **issue #20**; fix: **PR #21** (awaiting review). Two causes: a real CSS regression (the rigid ribbon overflowed horizontally below ~1300px and its author input intercepted clicks on the theme chips — fixed in `globals.css`), and accumulated UI-to-test desynchronization from the mid-July toolbar reworks (fixed in `tests/e2e/`). Local result with the CI environment replicated: 65 passed / 13 skipped / 0 failed. Open product question recorded in PR #21: the Découverte button is desktop-only, its e2e test is skipped on mobile viewports.
- Vercel preview deployments fail during `deploy:check` with `AUTH_SECRET is required`: the variable exists only in the Production environment of the Vercel project. Owner action required in Vercel settings; nothing to change in the repository.

## 6. Blocked Later Phases

| Phase | State | Reason |
| --- | --- | --- |
| C — R2 media identity and worker isolation | Blocked | Start only after Phase B review and merge; requires its own design and migration review |
| D — External API V1 | Blocked | Requires Phase A (merged) and the prerequisites defined by the implementation order |
| E — Global worker foundation | Blocked | Requires Phase C |
| F — Places metadata-first domain | Blocked | Requires Phases B and D and relevant worker/data gates |
| G — Places 2D UI | Blocked | Requires Phase F |
| H — Deep video analysis | Blocked | Requires Phases C and E, stable Places domain |
| I — 3D globe | Blocked | Requires Phase G and stable Places data |
| J — MCP and Hermes | Blocked | Requires Phase D; Places tools also require Phase F |

The presence of a detailed brief is not permission to execute a blocked phase.

## 7. Decisions That Must Not Be Guessed

These choices require an explicit decision at the relevant later phase:

- distributed API rate limiting on Vercel;
- map rendering provider;
- geographic resolution provider;
- canonical R2 media identity and historical repair policy;
- restricted PostgreSQL worker role;
- migration rollback or forward-recovery procedure;
- AI providers, models, budgets, and thresholds;
- VPS credentials, firewall, backups, and observability;
- permissions and confirmation model for sensitive Places commands.

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
