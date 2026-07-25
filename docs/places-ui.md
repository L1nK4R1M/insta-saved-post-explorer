# Places UI (Phase G 2D, Phase I 3D)

The `/places` page is the first complete Places experience: a 2D map, a
synchronized list, filters, statistics, a detail panel, navigation to the source
post and the existing review actions. It is **2D only** — the 3D globe is Phase I
and deep multimodal analysis is Phase H.

## 1. Architecture

```text
src/app/places/page.tsx                     Server Component: loads data, no HTTP loop
src/server/places/map-view.ts               owner-scoped view model for the map
src/features/places/query-state.ts          pure filter state (parse/serialize/filter)
src/features/places/actions.ts              internal Server Actions (review, posts)
src/features/places/components/
  places-explorer.tsx                       client orchestrator (search, panels, state)
  places-map.tsx                            PlacesMap: the only Leaflet-aware file
  place-detail-sheet.tsx                    detail + review actions
```

Rules honored:

- the page calls `src/server/places/*` **directly**; it never loops back through
  `/api/v1` and never imports Prisma into a component;
- the external `/api/v1` key stays **read-only**: review writes go through
  internal Server Actions that re-check the session server-side;
- every query is owner-scoped; a place owned by someone else behaves as absent.

## 2. Data loading

The owner capped Places at **under ~1000 canonical places**, so the page loads the
whole owner-scoped set once (`loadPlacesMapView`) and filters it in the browser.
There is deliberately **no bbox/viewport querying and no map pagination**; that
complexity is not warranted at this volume and would need a reviewed API
extension. `PLACES_MAP_MAX` (1000) is a safety cap, not a pagination scheme: when
it trips, the page says so rather than silently showing a partial map.

`loadPlacesMapView` returns what the public list DTO does not carry but the map
needs: the canonical **source themes** of the linked posts and one **preview
thumbnail** for the hover callout.

Themes are computed from **every** linked post — the relation is selected in full
but with a single tiny column (`mainTheme`) — because a place whose second theme
appears late in its links would otherwise be invisible to the theme filter, and
the map would disagree with the `source_theme` API filter. The preview thumbnail
comes from a second bounded query using `DISTINCT ON (place)`, so neither the
payload nor the query count grows with the number of posts per place (no N+1).

## 3. Map

`PlacesMap` wraps **Leaflet** + `leaflet.markercluster` behind a small prop
contract (`places`, `selectedId`, `onSelect`, `onHover`, `tileUrl`,
`tileAttribution`). It is the only file that knows about Leaflet, so replacing the
engine later means rewriting that file alone. Leaflet is imported lazily on the
client (`next/dynamic`, `ssr: false`) because it touches `window` at import time.

Rendering rules:

| Precision | Rendering |
| --- | --- |
| `EXACT` | pin, green |
| `PROBABLE` | pin, amber |
| `APPROXIMATE` | dashed **circle using the stored radius**, never a fake exact pin |
| `UNKNOWN` | creates no Place, so it never reaches the map |

`REJECTED` places are excluded from the map and the list. Clusters keep the map
responsive; selection flies to the place, otherwise the map fits the current
results. Motion respects `prefers-reduced-motion`.

**Tiles.** `NEXT_PUBLIC_PLACES_TILE_URL` is a **public, browser-side** tile key —
never the server-only `GEOAPIFY_API_KEY` used for geocoding. Attribution
("Powered by Geoapify | © OpenStreetMap contributors") is always displayed. When
the variable is empty the page still works — list, filters, statistics and review
— and states that the map is not configured.

## 4. Interaction

- **Hover a marker** → an arrow-pointed callout with the post photo, name, city,
  precision and post count. It is informative and does not capture the pointer.
- **Click a marker or a list row** → the detail sheet opens, the marker is
  selected, and the URL carries `placeId`.
- **Detail sheet** → precision (with the approximation radius), confirmation
  state, source themes, post count, associated post thumbnails linking to
  Instagram, and the review actions.

## 5. Filters, search and statistics

All filters live behind a single **Filtres** button with a count badge, so they
occupy no space when closed:

| Group | Values | Source |
| --- | --- | --- |
| Thème du post | `Voyages`, `Restaurant` | `Post.mainTheme` (eligibility contract) |
| Type de lieu | Restaurant, Café et brunch, Pâtisserie, Bar, Hôtel, Plage, Monument | `Place.category` (provider category, grouped) |
| Précision | Exact, Probable, Approximatif | `Place.precision` |
| Revue | À vérifier, Confirmés | `reviewStatus` + `isUserConfirmed` |
| Pays | **all** countries actually present (scrollable list + local search above 8) | `Place.countryCode` |

**Theme and place type are different data.** The theme is the post's
`mainTheme` and remains the eligibility rule; the place type comes from the
provider category stored on the place. Geoapify has **no "brunch" category**, so
brunch is currently folded into the café group (`src/lib/places/categories.ts`) —
a deliberate, reversible mapping recorded in code rather than an invented filter.

Statistics are intentionally limited to **theme** and **country**, in a popover
opened from the summary line. They reuse `getPlacesStats`, so the distinct counts
fixed in Phase F3 are not recomputed or double-counted here.

Search matches name, city, region and country, accent- and case-insensitively,
through the shared `foldForSearch` normalization.

## 6. URL state

Filters and the selection are serialized to the query string
(`q`, `theme`, `categories`, `precision`, `review`, `country`, `placeId`), so deep
links and browser history work. Unknown values are dropped at parse time, so a
hand-edited URL can never widen a filter.

## 7. Review actions

A Server Action is a directly invocable endpoint, so **every** action verifies the
session server-side before doing anything — reads included. Neither the `/places`
route nor a hidden button is a control.

- `loadPlacePostsAction` requires a valid session (`FORBIDDEN` otherwise) and then
  queries owner-scoped, so another owner's place behaves as `NOT_FOUND`.
- `confirmPlaceAction` and `rejectPlaceAction` additionally require the **admin**
  role and wrap the audited Phase F3 services.

Each action:

- re-checks the session (and the role for mutations) server-side;
- asks for an explicit confirmation in the UI before running;
- guards against double submission and shows a loading state;
- surfaces only a **bounded error code** mapped to a readable message — never an
  actor, a reason or a raw database message.

## 8. Accessibility and responsive

Keyboard navigation across search, filters, list and actions; visible focus
states; real buttons for actions; the list and detail expose the same information
as the map, so the map is never the only way to reach the data; `aria-expanded` on
the panel toggles; live region on the summary. On mobile the panels become
full-width sheets, the drawer takes the screen and touch targets stay large.

## 9. Additive API extension

Phase G added two **read-only, additive** filters to `GET /api/v1/places`,
without changing any existing contract:

- `categories` — comma-separated place-type group keys (multi-select);
- `source_theme` — normalized through the shared Places predicate, exactly like
  the statistics filter.

The historical single `category` filter is unchanged. See `docs/places-api.md`.

## 10. 3D globe (Phase I)

Phase I adds a second renderer beside Leaflet. **It does not replace it**: the 2D
map stays the default and is unchanged.

### 10.1 View contract

`view=map|globe` is additive. Absent, empty or unknown ⇒ `map`, so every URL
written before Phase I resolves exactly as before, and only the non-default value
is serialized — a 2D URL keeps its Phase G form byte-for-byte.

The view is the one piece of state that pushes a history entry, so browser back and
forward move between 2D and 3D; `popstate` restores view, filters and selection
together. The camera is deliberately **not** in the URL: it is continuous and would
pollute history, and `placeId` already restores a meaningful viewpoint. Cameras are
independent per view in v1; switching re-frames from the shared selection.

### 10.2 Renderer seam

`PlacesExplorer` owns every piece of state. `PlacesRenderer` picks one renderer and
loads it lazily; both honour `PlacesRendererProps` (already-filtered places,
`selectedId`, `onSelect`, `onHover`). Tile props stay on the 2D renderer, texture
props on the globe. Removing a view means deleting its component and its branch.

### 10.3 Engine and rendering

`react-globe.gl` (Three.js) behind `next/dynamic` with `ssr:false`, confined to
`places-globe.tsx`. All scene maths lives in the pure `src/lib/places/globe-projection.ts`.

- `EXACT` — brightest, tallest, largest point;
- `PROBABLE` — clearly different colour, lower and smaller;
- `APPROXIMATE` — a geodesic **area** sized from `approximationRadiusMeters`,
  never a point, and a stored radius never widens an `EXACT`/`PROBABLE` place;
- `UNKNOWN` never exists as a `Place`; `REJECTED` is excluded, as in 2D.

Zoomed out, places aggregate by continent then country through a spherical
centroid, so a group straddling the antimeridian does not collapse onto the wrong
meridian. Clicking a cluster drills in. Aggregation is entirely client-side: no
bbox query, no map pagination, no second source of truth.

### 10.4 Texture

A static local PNG generated from the public-domain Natural Earth 1:110m country
polygons (`npm run places:generate-earth-texture`, 36.5 KiB). Source, licence and
attribution are recorded in `public/places/ATTRIBUTION.md`, and the credit is shown
in the globe view. No provider, no key, no recurring cost.

### 10.5 Fallback, motion and accessibility

WebGL is probed **before** the 3D chunk is requested. Without it the globe is not
offered, a globe deep link renders 2D with an explicit message, the URL is
corrected, and filters, selection, list and detail are all preserved. Under
`prefers-reduced-motion` camera moves are instant. There is no auto-rotation at
all. The segmented `2D | 3D` control is a pair of real buttons with `aria-pressed`;
the list drawer remains the complete keyboard path and the globe never traps focus.

### 10.6 Cost

The 3D engine ships in its own chunk (~1.86 MiB) that a 2D-only session never
requests; the `/places` initial 2D payload grew by 4.2 KiB (+1.08 %). Measured
values are in `docs/changes/2026-07-25-phase-i-places-3d-implementation.md`, which
also records which D6 budgets are met and which still need a GPU device.

## 11. Deliberately out of scope

Deep multimodal analysis (Phase H), the VPS worker, MCP and Hermes, viewport/bbox
querying, map pagination and any optimization aimed at tens of thousands of points.
