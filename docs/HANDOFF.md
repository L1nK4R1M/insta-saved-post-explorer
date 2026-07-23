# Operational Handoff

Last updated: 23 July 2026  
Repository: `L1nK4R1M/insta-saved-post-explorer`  
Reference branch: `develop`  
Reference commit before this change: `9891dfdcefc143a8b67fb2bd3043e5dd45f08378`

## 1. Purpose

This file describes the current operational state for the next agent session. It does not replace the architecture, product contracts, or phase gates.

Authority order:

1. `../AGENTS.md` for global rules and prohibitions;
2. this file for the current active phase and handoff state;
3. `CODEX_IMPLEMENTATION_ORDER.md` for phase order and dependencies;
4. the implementation brief for the active phase;
5. the code and existing repository conventions.

If this handoff conflicts with an authoritative contract or with the code observed on the latest `develop`, stop and document the conflict before editing.

## 2. Last Completed Work

The phase-0 audit and architecture consolidation are complete.

Merged documentation established:

- one Next.js application;
- one PostgreSQL database;
- one Cloudflare R2 storage;
- one global VPS worker;
- one global MCP server;
- Places as a domain and handler inside the same product;
- Places eligibility based only on `Post.mainTheme` normalized to `Voyages` or `Restaurant`;
- no dependency between Places and an Instagram or internal collection named `Lieux`.

The last architecture pull request was documentation-only. No API V1, Places domain, worker foundation, MCP server, or Phase A filter correction has been implemented by that work.

## 3. Active Next Phase

```text
Phase A — Stabilisation de la bibliothèque existante
Status: AWAITING_REVIEW
Branch: claude/insta-saved-post-explorer-continue-wli2my
Pull request: #18 (base develop)
```

Phase A is implemented and awaiting review. Do not start Phase B, C, D, E, F, G, H, I, or J before PR #18 is reviewed and merged, and never in the same branch or pull request.

Branch divergence note: this handoff previously recommended `fix/library-filter-consistency`. The Claude session that implemented Phase A was constrained to the branch `claude/insta-saved-post-explorer-continue-wli2my`; Codex had not started the phase (no branch, no PR), so no work was duplicated.

### 3.1 Session Handoff

```text
Date et agent : 23 juillet 2026, Claude (Claude Code)
Phase active : A — Library filter consistency
Statut : AWAITING_REVIEW
Branche : claude/insta-saved-post-explorer-continue-wli2my
Pull request : #18
Dernier commit poussé : voir la branche (fix + test + docs)

Travail reçu de Codex :
- develop à 9891dfd, documentation phase 0 uniquement ; aucune implémentation Phase A.

Travail réalisé par Claude :
- extraction de libraryPostWhere() : prédicats Prisma partagés entre liste normale,
  comptage et random normal ;
- extraction de relevanceFilter() : condition SQL unique partagée entre liste
  pertinence, countRelevantPosts et random pertinence (auteur, année, collection,
  thème, type, tags, texte, ownerId partout) ;
- correctif du défaut latent make_date : Prisma lie les entiers JS en bigint,
  make_date(bigint, int, int) n'existe pas — toute requête de pertinence échouait
  à la préparation sur PostgreSQL ; cast ::integer explicite ajouté ;
- correctif du curseur de pertinence : Prisma sérialise les flottants JS en numeric
  à 16 chiffres, cassant l'égalité de tie-breaking sur rangs égaux ; le rang du
  curseur est désormais lié en texte casté ::double precision ;
- nouvelle suite tests/unit/library-filters-postgres.test.ts (16 régressions
  PostgreSQL réelles, gated sur TEST_DATABASE_URL, skip sans base).

Fichiers modifiés :
- src/server/library.ts
- tests/unit/library-filters-postgres.test.ts (nouveau)
- docs/HANDOFF.md, docs/IMPLEMENTATION_STATUS.md

Tests exécutés :
- npm ci : OK
- npm run db:generate : OK
- npm run db:deploy (PostgreSQL 16 local) : OK, 7 migrations
- npm run lint : OK, 0 warning
- npm run typecheck : OK
- TEST_DATABASE_URL=<pg16> npm run test : OK, 24 fichiers / 129 tests
- npm run test sans base : OK, 113 passés + 16 skippés (baseline intacte)
- TEST_DATABASE_URL=<pg16> npx vitest run tests/unit/library-filters-postgres.test.ts : 16/16
- npm run build : OK, 22 pages

Échecs ou validations restantes :
- aucun échec ; Playwright non exécuté (aucun changement de route ni de
  comportement navigateur, conformément à la section 8 du handoff).

Travail restant :
- revue humaine et merge de la PR #18 ;
- après merge, passer Phase A à COMPLETE dans IMPLEMENTATION_STATUS.md.

Prochaine action exacte pour Codex :
- relire la PR #18 (src/server/library.ts : relevanceFilter, libraryPostWhere ;
  tests/unit/library-filters-postgres.test.ts) et la merger si conforme ;
- ne démarrer la Phase B (isPlacesEligibleTheme, branche
  feat/places-theme-eligibility) qu'après ce merge ;
- pour exécuter la suite PostgreSQL : exporter TEST_DATABASE_URL vers une base
  migrée (npm run db:deploy) puis
  `TEST_DATABASE_URL=... npx vitest run tests/unit/library-filters-postgres.test.ts`.

Blocages et risques :
- le prédicat année du SQL de pertinence (make_date sur timestamptz) suit le fuseau
  du serveur PostgreSQL alors que le chemin Prisma utilise des bornes UTC ;
  comportement préexistant conservé, sans incidence si la base est en UTC (Neon
  par défaut) ; à trancher explicitement si un jour la base n'est plus en UTC.
```

## 4. Phase A Problem Statement

The PostgreSQL relevance paths do not currently apply one identical filter set across list, count, and random selection.

Observed defects in `src/server/library.ts`:

### 4.1 Normal random selection

`getRandomLibraryPost()` applies owner, theme, content type, text, and tags, but its database `where` currently omits:

- author;
- year;
- collection.

A random post can therefore escape the active author, year, or collection filter.

### 4.2 Random relevance selection

`getRandomRelevantPost()` applies owner, theme, content type, full-text search, and tags, but its SQL currently omits:

- author;
- year;
- collection.

Its count is calculated through `countRelevantPosts()`, while the identifier query has its own manually repeated conditions. Both paths must use the same effective predicates.

### 4.3 Relevance count

`queryRelevantPosts()` applies author, year, and collection in addition to the other relevance filters.

`countRelevantPosts()` currently omits author, year, and collection. As a result, `totalFiltered` can disagree with the returned result set and pagination can advertise results outside the active scope.

## 5. Phase A Required Outcome

The implementation must provide one shared or otherwise mechanically consistent source for the applicable predicates used by:

- normal list and normal random selection;
- relevance list;
- relevance count;
- relevance random selection.

All active filters must be respected where supported:

```text
theme
content type
author
year
collection
tags
search text
ownerId
```

Do not duplicate a fourth independent copy of the SQL conditions. Prefer small focused helpers that preserve parameterization through Prisma SQL fragments or existing Prisma `where` builders.

Do not rewrite the effective saved-date sorting path in this phase. Do not add a duplicate full-text index. The existing full-text index must first be confirmed in migrations.

## 6. Phase A Entry Gate

Before modifying code, the agent must:

1. update from the latest `develop`;
2. read `AGENTS.md`, this handoff, `IMPLEMENTATION_STATUS.md`, the phase-0 audit, and the implementation order;
3. inspect current signatures and SQL in `src/server/library.ts`;
4. inspect existing test conventions and identify the exact PostgreSQL-backed test file or create one with a repository-consistent name;
5. state the exact files to be modified;
6. state the regression tests that will prove the fix;
7. confirm that no schema migration, dependency, API route, Places file, worker file, or MCP file is required.

If a migration or broad refactor appears necessary, stop and explain why. It is not pre-authorized.

## 7. Phase A Required Tests

Add PostgreSQL-backed regression coverage proving at minimum:

1. relevance results and `totalFiltered` both respect author;
2. relevance results and `totalFiltered` both respect year;
3. relevance results and `totalFiltered` both respect collection;
4. normal random selection never escapes an active author filter;
5. normal random selection never escapes an active year filter;
6. normal random selection never escapes an active collection filter;
7. random relevance never escapes active author, year, or collection filters;
8. tag AND and OR behavior remains unchanged;
9. owner isolation remains intact;
10. existing `/api/posts` behavior remains unchanged.

Tests must use controlled database fixtures. Fallback-only tests are not sufficient because the fallback implementation already applies filters and can hide the PostgreSQL defect.

## 8. Phase A Validation Commands

Run fresh commands from the implementation branch:

```bash
npm ci
npm run db:generate
npm run db:deploy
npm run lint
npm run typecheck
npm run test
npm run build
```

Run the targeted PostgreSQL regression tests separately and report their exact command and result.

Run relevant Playwright tests only if the shared correction changes route or browser behavior. Do not declare completion when a required command fails. Report unrelated pre-existing failures separately with evidence.

## 9. Phase A Exit Gate and Stop Condition

Phase A is complete only when:

- list, count, and random paths use the same applicable filter scope;
- all required PostgreSQL regressions pass;
- no existing route or UI behavior is intentionally changed;
- no duplicate full-text index is added;
- lint, typecheck, tests, and build pass;
- `IMPLEMENTATION_STATUS.md` is updated with the branch, pull request, and proof;
- this handoff is updated to record Phase A as awaiting review or merged.

After proving the gate, stop and request review. Do not begin Phase B automatically.

## 10. Blocked Later Phases

| Phase | State | Reason |
| --- | --- | --- |
| B — Places theme eligibility | Blocked | Start only after Phase A review and merge |
| C — R2 media identity and worker isolation | Not started | Requires its own design and migration review |
| D — External API V1 | Blocked | Requires Phase A and the prerequisites defined by the implementation order |
| E — Global worker foundation | Blocked | Requires Phase C |
| F — Places domain | Blocked | Requires eligibility, API, and worker-related gates |
| G — Places 2D UI | Blocked | Requires the Places domain and API |
| H — Deep video analysis | Blocked | Requires R2 identity and the global worker foundation |
| I — 3D globe | Blocked | Requires stable Places data and the 2D interface |
| J — MCP and Hermes | Blocked | Requires stable API V1; Places tools also require the Places domain |

The presence of a detailed brief is not permission to execute a blocked phase.

## 11. Decisions That Must Not Be Guessed

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

Do not choose providers or add dependencies during Phase A.

## 12. Required Pull Request Report

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
