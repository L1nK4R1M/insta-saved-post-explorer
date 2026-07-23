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
No implementation phase is active.
Phases 0, A, B are merged. The next executable phase is C — R2 media identity
and worker isolation — which is NOT started and requires its own design and
migration review before any code (see sections 6 and 7). Do not begin it
without an explicit owner decision.
Branch for the next work: claude/insta-saved-post-explorer-continue-wli2my
(restart from the latest develop for each new unit of work).
```

Branch divergence note: `CODEX_IMPLEMENTATION_ORDER.md` recommends per-phase branch names (`feat/places-theme-eligibility`, etc.). The Claude sessions were constrained to the branch `claude/insta-saved-post-explorer-continue-wli2my` (restarted from the merged `develop` for each phase). Codex had not started any of these phases, so no work was duplicated.

### 3.1 Session Handoff

```text
Date et agent : 23 juillet 2026, Claude (Claude Code)
Phase active : aucune (0, A, B mergées ; e2e remise au vert mergée)
Statut : develop stable, CI entièrement verte
Branche : claude/insta-saved-post-explorer-continue-wli2my (repartie de develop 1b5fa16)
Dernier commit develop : 1b5fa16

Travail réalisé par Claude durant la session :
- Phase A mergée (PR #18) : prédicats de filtres partagés + 16 régressions PostgreSQL ;
- Phase B mergée (PR #19) : isPlacesEligibleTheme() + 8 tests ;
- diagnostic de la CI e2e rouge depuis le 14 juillet (issue #20) ;
- remise au vert e2e mergée (PR #21, closes #20) : un vrai bug CSS de débordement
  de ruban corrigé + réalignement des specs ; CI develop désormais verte.

Vérifications finales :
- develop@1b5fa16 : « Lint, types, unit tests and build » vert, « Browser tests »
  vert, preview Vercel verte (AUTH_SECRET ajouté en env Preview par le propriétaire) ;
- Playwright complet en local (env CI répliqué) : 65 passed / 13 skipped / 0 failed.

Prochaine action exacte pour Codex :
- il n'y a rien à merger ni à corriger sur develop ;
- avant tout code de la Phase C, produire (ou faire valider) le design d'identité
  média R2 et d'isolation worker + le plan de migration/rollback — décisions listées
  en section 7, à ne pas deviner ;
- tout futur consommateur Places (service, job, statistique, action UI, worker, MCP)
  doit importer isPlacesEligibleTheme() depuis src/lib/places/eligibility.ts, jamais
  recopier les chaînes de thème.

Question produit ouverte (consignée dans la PR #21) :
- le bouton « Découverte » est desktop-only ; son test e2e est skippé sur mobile.
  À trancher : faut-il l'exposer au mobile ? (hors périmètre des phases en cours.)

Blocages et risques :
- aucun blocage courant. Rappel : la Phase C dépend de décisions d'architecture
  non prises (section 7).
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
| C — R2 media identity and worker isolation | Not started (next executable) | Requires its own design and migration review; decisions in section 7 must be made first |
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
