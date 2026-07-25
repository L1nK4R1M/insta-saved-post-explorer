# Operational Handoff

Last updated: 25 July 2026  
Repository: `L1nK4R1M/insta-saved-post-explorer`  
Reference branch: `develop`  
Reference implementation commit: `2bd2098472c65eeb24c52aa0ee893e09b8e20261`

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
| I design — Places 3D globe | PR #35, squash `3fef818`. ADR `ACCEPTED`, six decisions closed, T0 satisfied. Documentation only. |

## 3. Current execution pointer

```text
Active implementation branch:
claude/phase-i-places-3d-implementation   (from develop 3fef818)

Phase F is CLOSED and COMPLETE.
Phase G is CLOSED and COMPLETE.
Phase I design is CLOSED and APPROVED (PR #35, squash 3fef818; ADR ACCEPTED).

Phase I implementation T1-T10 is AWAITING_REVIEW.
It is NOT merged and Phase I is NOT complete.

One owner decision is open and blocks closing the phase: the D6 frame-rate
budgets could not be validated because the CI container has no GPU. See
docs/changes/2026-07-25-phase-i-places-3d-implementation.md, sections 6.3 and 9.
```

Phase G owner decisions remain final for the 2D implementation:

- Leaflet + `leaflet.markercluster`;
- Geoapify raster tiles with mandatory attribution;
- all canonical places loaded client-side because the expected maximum remains below 1000;
- no bbox/viewport querying and no map pagination;
- `PlacesMap` kept as a lightweight swappable abstraction;
- Apple-Plans-inspired minimal design;
- brunch provisionally folded into the café group;
- multi-select filters enabled.

Phase I owner decisions (ADR §10, `ACCEPTED`) are implemented as recorded:
`react-globe.gl`/`globe.gl`, Concept 2 sober with restrained Concept 1 elements,
static free texture with documented licence, additive `view=map|globe` with 2D
default and independent cameras, full mobile 3D with a WebGL fallback, and the
measurable D6 budgets.

## 4. Phase G merge proof

- PR: `#34 — feat(places): Phase G — Places 2D UI and contextual navigation`;
- reviewed head: `82a9760df92b5aa58f6a411c3f90bb07fb7cb46a`;
- squash merge on `develop`: `2bd2098472c65eeb24c52aa0ee893e09b8e20261`;
- CI run #107 completed successfully;
- final local proof reported in the PR: 50 files, 440 tests passed, 0 failed; build and e2e green;
- security correction: `loadPlacePostsAction()` now verifies the session before any read and remains owner-scoped;
- correctness correction: `sourceThemes` is derived from all linked posts instead of the first six;
- UX correction: every country remains selectable through a searchable, scrollable local filter;
- no migration, no Prisma schema change and no breaking API change.

## 5. Environment and deployment state

### Vercel

| Environment | Git branch | State |
| --- | --- | --- |
| Production | `main` | Isolated from development. |
| Preview development | `develop` | Tracks the merged Phase G implementation. |

Stable URLs:

```text
Production: https://insta-saved-post-explorer.vercel.app
Develop:    https://insta-saved-post-explorer-git-develop-l1nk4r1ms-projects.vercel.app
```

### Neon

Project: `fancy-mud-69762258`

| Environment | Neon branch | Verified schema state |
| --- | --- | --- |
| Production | `main` / `br-super-snow-asyrmnbm` | Phase C migration applied. F1 remains intentionally unpromoted. |
| Development | `develop` / `br-sparkling-glade-as9gow4m` | Phase C and F1 migrations applied. F2, F3 and G require no migration. |

Do not run `prisma migrate dev`, `prisma db push` or seeds against either deployed database.

## 6. Phase state

| Phase | State | Reason |
| --- | --- | --- |
| C — R2 media identity and worker isolation | COMPLETE | PR #24; migration applied to Neon `main` and `develop`. |
| D — External API V1 | COMPLETE | PR #26. Distributed rate limiting remains deferred. |
| E — Global worker foundation | READY, separate | Required before Phase H. Do not mix it into Phase I. |
| F — Places metadata-first domain | COMPLETE | F1/F2/F3 and hardening merged; exit gate accepted. |
| G — Places 2D UI | COMPLETE | PR #34, squash `2bd2098`; CI #107 green. |
| H — Deep Places analysis | BLOCKED | Requires Phase E and stable worker infrastructure. |
| I — Places 3D globe | AWAITING_REVIEW | T1–T10 implemented on `claude/phase-i-places-3d-implementation`. All suites green; no migration; Leaflet untouched. One open owner decision on the D6 frame-rate budgets, which no GPU-less environment can validate. |
| J — Unified MCP and Hermes | BLOCKED | Requires later orchestration decisions and confirmations. |

## 7. Open decisions that must not be guessed

Phase I product decisions are **all closed** (ADR `ACCEPTED`, 25 July 2026) and implemented. Remaining open items:

- **Phase I, D6 frame rate.** The implementation measured 20 fps desktop and 18 fps mobile on a CPU software rasterizer (SwiftShader); the container has no GPU. Two measurements show the workload is fill-rate bound rather than scene bound, and the applied optimization (capping the render pixel ratio at 1.5) raised mobile from 12 to 18 fps. The budgets themselves remain **unvalidated**. The owner must decide: accept the phase with the frame-rate budgets pending a run on a GPU device, or hold it until `npm run places:measure-globe` has been run on real hardware. Do not close Phase I before this is answered.
- server-side AI providers, models, budgets and escalation thresholds for Phase H;
- VPS credentials, firewall, backups and observability for Phase E;
- final confirmation model for sensitive Phase J commands.

## 8. Exact next action — review the Phase I implementation

1. Review `claude/phase-i-places-3d-implementation` (T1–T10). Do not merge before review.
2. Read `changes/2026-07-25-phase-i-places-3d-implementation.md` — it records the
   architecture actually built, the pinned dependency versions, the texture licence,
   the full test inventory and every measured value, including the budgets that were
   **not** met and why.
3. Answer the open D6 frame-rate decision in §7 above. Phase I cannot be marked
   COMPLETE while it is open.
4. To obtain the missing numbers, run on a machine with a GPU:
   `npm run build && npm run start`, then
   `DATABASE_URL=<local> npm run places:measure-globe -- --url http://127.0.0.1:3000`.
5. Keep Phase I to the 3D experience alone: no Phase E, H, J, worker, Hermes, MCP,
   OCR, transcription or multimodal analysis, no Prisma migration, and **do not
   replace Leaflet**.
