# Phase G — Places 2D UI and contextual navigation — entry brief

Status: **READY** (not started). Last updated: 24 July 2026.

This is an **entry brief**, not a new specification. A complete, authoritative Phase G
contract already exists and must not be rewritten. This document only: records the
entry gate, points to the source of truth, lists what is already built and reusable,
sets the phase boundaries, and flags the ambiguities and open product decisions the
next session must resolve **with the owner** before writing UI code.

Do not implement Phase G from this brief alone, and do not start it without an
explicit Phase G implementation prompt.

## 1. Source of truth (authoritative — do not duplicate)

| Concern | Authoritative document |
| --- | --- |
| Phase order, scope and exit gate | `CODEX_IMPLEMENTATION_ORDER.md` §5 "Phase G", §6 dependencies (`D → F → G → I`) |
| Places UI/UX contract (nav, deep links, URL state, stats, modes) | `CODEX_PLACES_EXTENSION.md` §13 "Navigation et interface" |
| Places statistics API shape | `CODEX_PLACES_EXTENSION.md` §14, and the live `docs/places-api.md` |
| Precision semantics (`EXACT`/`PROBABLE`/`APPROXIMATE`/`UNKNOWN`) | `CODEX_PLACES_EXTENSION.md` §7 |
| Acceptance criteria and Codex prohibitions | `CODEX_PLACES_EXTENSION.md` §18, §19 |
| Global rules and architecture | `AGENTS.md`, `CODEX_IMPLEMENTATION_ORDER.md` §2 |
| Read API and review services already shipped | `docs/places-api.md` |

Authority order on conflict: `AGENTS.md` → `CODEX_IMPLEMENTATION_ORDER.md` →
`CODEX_PLACES_EXTENSION.md` → existing repo conventions.

## 2. Entry gate — satisfied

- Phase F is **COMPLETE** (F1/F2/F3 + hardening PR #32 merged; exit gate accepted via successful real local validation).
- Places schema is stable (F1 migration on Neon `develop`; no pending migration).
- Read-only `/api/v1/places*` API is stable and tested.
- Distinct statistics and internal review/merge services are available.
- Real Places data was validated locally (idempotent import, coherent persistence).
- Phase G is explicitly authorised to start in a dedicated branch after an explicit prompt.

## 3. Required coverage → where it is already specified

Each item the Phase G brief must cover is already defined in the source of truth:

| Required coverage | Specified in |
| --- | --- |
| `/places` route, permanent Places nav (desktop + mobile), `PLACES_ENABLED` gate | `CODEX_PLACES_EXTENSION.md` §13.1 |
| 2D map, list synchronised with the map, clusters, bounding box | §13.5 (Carte 2D) |
| Filters, search | §12.2 (read filters), §13.5 |
| Statistics cards and country/continent breakdown | §13.4, §14 |
| `EXACT` / `PROBABLE` / `APPROXIMATE` / `UNKNOWN` rendering; approximate zones (circle/area, never a fake exact pin); `UNKNOWN` not on the map | §7, §13.5 |
| Navigation to the source post; `Voir dans Places`; deep links `postId`/`placeId`/country/continent; URL state and browser history | §13.2, §13.3 |
| Human review and correction (Review queue and detail panel) | §13.5 (Review), §13.2 |
| Responsive mobile/desktop, accessibility (reduced motion) | §13.1, §13.5 |
| Reuse of `/api/v1/places*`; no direct Prisma in components; no internal HTTP loop from Server Components | `AGENTS.md` §3.3, `CODEX_PLACES_EXTENSION.md` §4.1 |

## 4. Already built and reusable (do not re-implement)

- Seven read-only routes on `develop`: `GET /api/v1/places`, `/{id}`, `/{id}/posts`, `/stats`, `/eligible-posts`, `/unresolved`, `/analysis-jobs/{id}`.
- Owner-scoped server query services (`src/server/places/queries.ts`), distinct statistics (`src/server/places/stats.ts`), and internal review/merge services (`src/server/places/review.ts`).
- Opaque cursor pagination, `source_theme` stats filter, precision + review-status data.
- Shared eligibility predicate (`isPlacesEligibleTheme` / `canonicalPlacesTheme`).

## 5. Phase boundaries (in scope / out of scope)

In scope for Phase G: the **2D** experience only — Map, List, Review, statistics,
contextual navigation and deep links.

Out of scope for Phase G (do not implement here):

- **3D globe** — this is Phase I. `CODEX_PLACES_EXTENSION.md` §13.5 describes a globe as
  part of the overall Places V1, but `CODEX_IMPLEMENTATION_ORDER.md` sequences it as a
  separate Phase I after G; the order document governs.
- **Deep multimodal analysis** (FFmpeg/OCR/transcription) — this is Phase H.
- Any new worker, second MCP, or direct Prisma/DB access from components or MCP.

## 6. Ambiguities to resolve before implementation (flagged, not decided)

1. **Viewport / map queries are not implemented yet.** F3 intentionally deferred a
   `bbox` filter and a `GET /api/v1/places/nearby` route (`docs/places-api.md`), while
   `CODEX_PLACES_EXTENSION.md` §12 lists `nearby` and a `bbox` filter. Phase G's map
   viewport querying will need one of: (a) a small read-only additive extension
   (`bbox`/`nearby`) to `/api/v1/places`, or (b) working within cursor pagination for
   an initial version. Decide the approach with the owner; keep it read-only and additive.
2. **List `source_theme` filter deferred.** F3 shipped `source_theme` on `/stats` but
   deferred a `source_theme` list filter on `GET /api/v1/places` (`docs/places-api.md`).
   The theme filter on the map/list may need it — a small additive read-only extension.
3. **Review/correction writes are not on the external read-only API.** The Phase D
   external key is read-only; the review/correct/merge services (`review.ts`) are
   internal. The Review UI must call these through **internal server actions/services**,
   not the read-only `/api/v1` key. Confirm the exact internal write surface for the UI
   (server actions vs. an authenticated internal route) — no new public mutation API.
4. **Performance at several thousands of posts** requires a decision on progressive
   loading / clustering strategy tied to decision (1) above.

## 7. Open product decisions (must not be guessed — owner decides)

Per the mission constraints, the next session must **not** choose these without
authorisation; list and resolve them with the owner first:

- map/rendering library;
- tile provider;
- final visual style / `/places` page design;
- exact cluster behaviour (thresholds, expansion);
- map caching strategy;
- viewport query limits;
- display thresholds (when to cluster vs. show individual pins);
- confirmation model for sensitive review actions (also relevant to Phase J).

## 8. Next action

1. Wait for an explicit Phase G implementation prompt.
2. Create the branch `claude/phase-g-places-2d-ui`, reset from the latest `develop`.
3. Resolve §6 ambiguities and §7 open decisions with the owner.
4. Slice Phase G into vertical, independently verifiable tasks (VibeSpec Standard route
   is expected for this UI phase: specification, acceptance criteria, tests, review).
5. Honour the Phase G exit gate in `CODEX_IMPLEMENTATION_ORDER.md` §5: working browser
   navigation and history, a post opens its targeted place, multiple places frame the
   map, an ineligible post offers no automatic analysis, and performance stays
   acceptable on the real volume.
