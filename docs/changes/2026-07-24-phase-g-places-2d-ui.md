# Change record — Phase G: Places 2D UI and contextual navigation

- Date: 24 July 2026
- Branch: `claude/phase-g-places-2d-ui` (from `develop` `3927ddb`)
- VibeSpec route: **Critical** (new external dependency, new screen, additive contract extension)
- Scope: Phase G only — 2D. No Phase H, no Phase I, no worker, no MCP/Hermes.

## Owner decisions applied

| Decision | Choice |
| --- | --- |
| Map engine | Leaflet + `leaflet.markercluster` |
| Tiles | Geoapify raster, attribution mandatory, public `NEXT_PUBLIC_` tile key only |
| Data strategy | All places loaded client-side (< ~1000); no bbox/viewport querying, no map pagination |
| Abstraction | `PlacesMap` — light, swappable, no over-engineering |
| Design | Apple-Plans-inspired minimal chrome, validated on mockups: filters behind one button, statistics limited to theme and country |
| Brunch | Folded into the café group for now (no Geoapify category); revisit later |
| Multi-select filters | Enabled, through an additive read-only API extension |

## Requirements implemented

`/places` route and permanent header entry (desktop + mobile); 2D map with
clustering; `EXACT`/`PROBABLE` pins, `APPROXIMATE` as a dashed circle using its
stored radius, `UNKNOWN` never mapped, `REJECTED` excluded; hover callout with the
post photo and an arrow pointing at the marker; click opens the detail sheet;
synchronized list drawer; search; filters (theme, place type, precision, review,
country) behind one button with a count badge; statistics popover limited to theme
and country; navigation to the source post on Instagram; review actions
(confirm/reject) through internal Server Actions; URL deep links and history;
responsive; keyboard accessible; graceful states when the database or the tile key
is absent.

## Architecture

- `src/app/places/page.tsx` — Server Component calling `src/server/places/*`
  directly: no internal HTTP loop, no Prisma in components.
- `src/server/places/map-view.ts` — owner-scoped view model (source themes +
  preview thumbnail) with a safety cap surfaced in the UI.
- `src/features/places/query-state.ts` — pure filter state (parse, serialize,
  count, filter), fully unit-tested.
- `src/features/places/components/places-map.tsx` — the only Leaflet-aware file.
- `src/features/places/actions.ts` — internal Server Actions; the external
  `/api/v1` key stays read-only.
- `src/lib/places/categories.ts` — provider category → friendly group mapping.

## Additive API extension (read-only, non-breaking)

`GET /api/v1/places` accepts `categories` (multi-select place-type groups) and
`source_theme` (shared Places normalization, restricted through
`PostPlace → Post.mainTheme`, never a collection join). The historical single
`category` filter and all response shapes are unchanged.

## Tests

- `places-categories` (10) — grouping, prefixes, parsing, brunch → café.
- `places-query-state` (15) — URL parsing/serialization/round-trip, filter
  semantics, review split, rejected exclusion.
- `places-queries-postgres` (+5) — multi-category, hierarchical prefixes, single
  category preserved, source-theme filter, combined + owner-scoped.
- `tests/e2e/places.spec.ts` (10 × 2 projects) — route, nav entry, filter panel,
  URL/badge sync, deep-link restore, search, statistics, list, keyboard, overflow.

No real tile or Geoapify request is made in any automated test.

## Verification

`npm run db:generate`, `npm run lint`, `npm run typecheck`, `npm run test`,
`npm run build`, `npm run test:e2e` — all green (see the PR body for exact counts).

## Not done / deferred

3D globe (Phase I), deep multimodal analysis (Phase H), viewport/bbox querying,
map pagination, tens-of-thousands-of-points optimization, a dedicated brunch
source, map tile caching. No migration, no Prisma schema change, no Neon change.

## Verdict

`PHASE_G_READY_FOR_REVIEW`
