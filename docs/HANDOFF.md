# Operational Handoff

Last updated: 23 July 2026  
Repository: `L1nK4R1M/insta-saved-post-explorer`  
Reference branch: `develop`  
Reference commit before this documentation branch: `6f1e1be92b5d98012154d72ee339a7232d7d400d`

## 1. Purpose

This file describes the current operational state for the next agent session. It does not replace the architecture, product contracts, or phase gates.

Authority order:

1. `../AGENTS.md` for global rules and prohibitions;
2. this file for the current active phase and handoff state;
3. `CODEX_IMPLEMENTATION_ORDER.md` for phase order, per-phase scope, and dependencies;
4. the implementation brief and reviewed design for the active phase;
5. the code and existing repository conventions.

If this handoff conflicts with an authoritative contract or with the code observed on the latest `develop`, stop and document the conflict before editing.

## 2. Completed Work

| Phase | Outcome |
| --- | --- |
| 0 — API and Places audit | Documentation merged (PR #15). Architecture locked: one app, one PostgreSQL, one R2, one global worker, one global MCP; Places eligibility from `Post.mainTheme` (`Voyages`, `Restaurant`) only, no `Lieux` collection dependency. |
| A — Library filter consistency | Merged into `develop` (PR #18, squash `69ea0da`). Shared predicates `libraryPostWhere()` and `relevanceFilter()` in `src/server/library.ts`; author, year, and collection now apply to every list, count, and random path. Two latent relevance-SQL type-binding defects fixed. 16 PostgreSQL regressions added. |
| B — Places theme eligibility | Merged into `develop` (PR #19, squash `2323e0d`). `PLACES_ELIGIBLE_THEMES` + `isPlacesEligibleTheme()` in `src/lib/places/eligibility.ts`, reusing `foldForSearch()`; 8 unit tests. |
| E2e suite re-green | Merged into `develop` (PR #21, squash `1b5fa16`, closes issue #20). Fixed the CSS ribbon-overflow regression and realigned the library/toolbar e2e specs. `develop` browser tests are green. |
| C — R2 media identity and worker isolation | Design merged (PR #23). Implementation merged (PR #24, squash `0870d69`): authoritative media identity, restricted `ipe_worker_reader`, migration, backfill and PostgreSQL tests. |
| D — External API V1 | Merged into `develop` (PR #26, squash `9e57f93`). Read-only Bearer SHA-256 authentication, stable errors, six thin `/api/v1` routes, preflight validation, documentation and tests. Historical `/api/*` routes unchanged. |

## 3. Active Phase

```text
No implementation phase is active.
Phases 0, A, B, C, D are merged and develop CI is green.
Next executable phase: F — Places metadata-first domain.

Phase F has a proposed reviewed design and implementation plan:
- docs/CODEX_PHASE_F_METADATA_FIRST_DESIGN.md
- docs/superpowers/plans/2026-07-23-phase-f-metadata-first.md

The former geographic-provider blocker is resolved by the proposed design:
- Geoapify behind a replaceable PlaceResolver interface;
- local caption-only JSONL workflow with Claude Code or Codex CLI;
- no VPS, AI API key, or application-stored OAuth credential required for Phase F.

Claude must start with F1 only: schema and domain contracts.
Do not start F2 until F1 is reviewed and merged.
Do not start F3 until F2 is reviewed and merged.

Phase E is also unblocked but remains separate and depends on VPS decisions.
Claude branch constraint: claude/insta-saved-post-explorer-continue-wli2my
(restart from latest develop for every Phase F sub-PR).
```

Branch divergence note: `CODEX_IMPLEMENTATION_ORDER.md` recommends per-phase branch names. Claude sessions may be constrained to `claude/insta-saved-post-explorer-continue-wli2my`; if so, reset that branch from the latest merged `develop` before each F1/F2/F3 unit. Never continue from an unmerged or stale Phase F branch.

### 3.1 Session Handoff

```text
Date and planning agent: 23 July 2026, Codex/ChatGPT
Implementation owner: Claude Code
Review owner: Codex

Phase active: none until the Phase F design PR is merged
Latest develop before planning: 6f1e1be

Planning work completed:
- verified Phases A–D are merged and Phase F dependencies are satisfied;
- selected Geoapify as Phase F resolver behind PlaceResolver;
- defined a no-VPS caption-only workflow using exported JSONL and external Claude/Codex analysis;
- split Phase F into F1 schema/contracts, F2 resolver/persistence, F3 read API/stats/review;
- documented migration, owner isolation, idempotency, precision, cursor and auth boundaries;
- created a task-level TDD implementation plan.

Exact next action for Claude after this documentation is merged:
1. reset Claude branch from latest develop;
2. read AGENTS.md, this handoff, CODEX_PLACES_EXTENSION.md,
   CODEX_PHASE_F_METADATA_FIRST_DESIGN.md and the Phase F plan;
3. execute only Sub-PR F1;
4. write failing PostgreSQL tests before the Prisma migration;
5. open F1 PR and stop.

Exact Codex responsibility:
- do not edit Claude's active branch;
- review each F1/F2/F3 PR against the design;
- inspect migration safety, owner isolation, idempotency, UNKNOWN semantics,
  Geoapify secret handling, external read-only API boundary and tests;
- approve or request concrete changes;
- update this handoff/status only after merge evidence exists.
```

Open product question unrelated to Phase F: the `Découverte` button remains desktop-only and its mobile e2e test is skipped.

## 4. Phase B Contract Summary

The merged contract lives in `src/lib/places/eligibility.ts`:

- `PLACES_ELIGIBLE_THEMES = ["Voyages", "Restaurant"]` is the single canonical constant;
- `isPlacesEligibleTheme(mainTheme)` uses the shared `foldForSearch()` normalization;
- `null`, empty, neighboring and compound themes are not eligible;
- no collection, tag, slug, or Instagram provenance is ever consulted;
- leaving an eligible theme blocks future automatic analyses but never silently deletes confirmed Places data.

Every future entry point must import this predicate.

## 4bis. Phase C Contract Summary

- `PostMedia` carries authoritative R2 identity: `objectKey`, `mimeType`, `byteSize`, `versionTag`, `identityState`, `checkedAt`, and denormalized `ownerId`;
- only `VERIFIED` media is analyzable by a future worker;
- the restricted role `ipe_worker_reader` reads only approved identity columns;
- the worker will resolve an object only as a verified `objectKey`, never as an arbitrary URL.

## 5. Phase F Design Summary

The proposed reviewed design is `CODEX_PHASE_F_METADATA_FIRST_DESIGN.md`.

Key decisions that become signed off when that document is merged:

1. Geoapify is the Phase F geographic resolver, hidden behind `PlaceResolver`.
2. Claude/Codex output textual candidates only; models never provide coordinates.
3. Caption analysis is a local JSONL export/import workflow until the VPS exists.
4. `UNKNOWN` creates no Place row.
5. `EXACT`, `PROBABLE`, and `APPROXIMATE` have deterministic semantics and thresholds.
6. `PostPlace` contains one canonical link per owner, post, and place; repeated mentions live in evidence.
7. Places list APIs use opaque cursor pagination.
8. The Phase D external API key remains read-only; Phase F mutations are service/local-script only.
9. Phase F is delivered as F1, F2, and F3 reviewable sub-PRs.

The map renderer remains a Phase G decision. Phase F must not add Mapbox or map UI dependencies.

## 6. CI and Environment State

- `develop` CI is green after the Phase D merge and subsequent handoff update.
- Vercel preview deployments succeed after `AUTH_SECRET` was added to the Preview environment.
- Phase F requires `GEOAPIFY_API_KEY` only when Places resolution is enabled. It is server-only and must never use a `NEXT_PUBLIC_` prefix.
- Local Claude Code/Codex OAuth credentials stay outside Vercel, PostgreSQL, `.env.example`, logs, and repository files.

## 7. Phase State

| Phase | State | Reason |
| --- | --- | --- |
| C — R2 media identity and worker isolation | Merged | PR #24 (`0870d69`). |
| D — External API V1 | Merged | PR #26 (`9e57f93`). Distributed rate limiting remains deferred. |
| E — Global worker foundation | Ready, separate | Phase C merged; requires VPS decisions and credentials. Do not mix with F. |
| F — Places metadata-first domain | Ready after design merge | Dependencies B and D merged. Execute F1 → review/merge → F2 → review/merge → F3. |
| G — Places 2D UI | Blocked | Requires completed Phase F. |
| H — Deep Places analysis | Blocked | Requires C, E, and stable Phase F. |
| I — Places 3D globe | Blocked | Requires G and stable Places data. |
| J — Unified MCP and Hermes | Blocked | Places tools require completed Phase F. |

The presence of a detailed brief is not permission to execute a blocked phase.

## 8. Decisions That Must Not Be Guessed

Still open for later phases:

- distributed API rate limiting on Vercel;
- map rendering provider for Phase G/I;
- server-side AI providers, models, budgets, and thresholds for Phase H;
- VPS credentials, firewall, backups, and observability for Phase E;
- final permission and confirmation model for sensitive Phase G/J commands.

Proposed and signed when the Phase F design PR merges:

- Geoapify geographic resolution;
- caption-only local workflow;
- cursor pagination;
- precision and UNKNOWN semantics;
- one canonical PostPlace link;
- no external writes through the Phase D API key;
- F1/F2/F3 delivery split.

Signed off for Phase C: see `CODEX_R2_WORKER_ISOLATION_DESIGN.md` section 8.

## 9. Required Pull Request Report

Every Phase F sub-PR must include:

```text
Phase active
Sub-phase active (F1, F2, or F3)
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

Every Phase F PR must explicitly confirm that it did not start another phase and did not store captions, candidate JSONL, API keys, OAuth credentials, or production data in Git.
