# Places UI (MapLibre 2D + globe projection)

The `/places` page is the complete Places experience: a MapLibre map/globe, a
synchronized list, filters, statistics, a detail panel, navigation to the source
post and the existing review actions. Deep multimodal analysis remains Phase H.

## 1. Architecture

```text
src/app/places/page.tsx                     Server Component: loads data, no HTTP loop
src/server/places/map-view.ts               owner-scoped view model for the map
src/features/places/query-state.ts          pure filter state (parse/serialize/filter)
src/features/places/actions.ts              internal Server Actions (review, posts)
src/features/places/components/
  places-explorer.tsx                       client orchestrator (search, panels, state)
  places-map.tsx                            PlacesMap: the only MapLibre-aware file
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

`PlacesMap` wraps **MapLibre GL JS** behind a small prop contract (`places`,
`selectedId`, `onSelect`, `onHover`, `tileUrl`, `tileAttribution`). It is the only
file that knows about MapLibre, so changing the engine later means rewriting that
file alone. MapLibre is imported lazily on the client (`next/dynamic`, `ssr: false`)
because it needs browser APIs at runtime.

MapLibre's native GeoJSON source provides clustering, while a GeoJSON layer renders
the exact/probable pins. Approximate results remain available in the list and review
flows but never reach the map or globe (REQ-001). Category emojis are rasterized as
local MapLibre images, so pin rendering does not depend on a remote glyph endpoint.
The existing Geoapify raster tiles, mandatory attribution, fit-to-results behavior
and interaction callbacks remain unchanged.

Rendering rules:

| Precision | Rendering |
| --- | --- |
| `EXACT` | pin, green |
| `PROBABLE` | pin, amber |
| `APPROXIMATE` | not rendered on the map or globe; remains available in list/review |
| `UNKNOWN` | creates no Place, so it never reaches the map |

`REJECTED` places are excluded from the map and the list. Clusters keep the map
responsive; selection flies to the place, the 2D map fits current results, and the
globe keeps its world view until returning to 2D. Motion respects
`prefers-reduced-motion`.

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
- **Keyboard** → the map path is one tab stop followed by an arrow-key roving list of
  selectable buttons, so selection does not depend on pointer access to a canvas layer.
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

A Server Action is a directly invocable endpoint. Public reads therefore never
accept an owner from the browser and always use the configured application owner.
Neither the `/places` route nor a hidden button is a mutation control.

- `loadPlacePostsAction` supports the public Places page and queries only the
  configured owner, so another owner's place behaves as `NOT_FOUND`.
- `confirmPlaceAction` and `rejectPlaceAction` additionally require the **admin**
  role and wrap the audited Phase F3 services.

Each action:

- keeps every database operation owner-scoped;
- re-checks the session and role for mutations server-side;
- asks for an explicit confirmation before a mutation;
- guards against double submission and shows a loading state;
- surfaces only a **bounded error code** mapped to a readable message — never an
  actor, a reason or a raw database message.

## 8. Accessibility and responsive

Keyboard navigation across search, filters, list and actions; visible focus
states; real buttons for actions; the list and detail expose the same information
as the map, so the map is never the only way to reach the data; `aria-expanded` on
the panel toggles; live region on the summary. On mobile the panels become
full-width sheets, the drawer takes the screen and touch targets stay large. The
search uses its own row, with filters and the complete `2D | 3D` control on a
second row. The page header includes a deterministic `Retour aux posts` link to
the library, including when `/places` was opened directly.

## 9. Additive API extension

Phase G added two **read-only, additive** filters to `GET /api/v1/places`,
without changing any existing contract:

- `categories` — comma-separated place-type group keys (multi-select);
- `source_theme` — normalized through the shared Places predicate, exactly like
  the statistics filter.

The historical single `category` filter is unchanged. See `docs/places-api.md`.

## 10. 3D globe (Phase I)

Phase I keeps 2D as the default and adds MapLibre's native `globe` projection. It
does not create a second WebGL scene: both views share the same renderer instance.

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

`PlacesExplorer` owns every piece of state. `PlacesRenderer` mounts the client-only
MapLibre renderer and passes the same `PlacesRendererProps` (already-filtered
places, `selectedId`, `onSelect`, `onHover`) to both projections. Raster tile props and the local texture props are available to the shared renderer,
so switching views does not replace the WebGL canvas or the GeoJSON sources when
MapLibre is active. With no raster provider, the 2D view intentionally stays on its
no-map fallback; entering the globe then mounts MapLibre for the first time.

### 10.3 Engine and rendering

MapLibre GL JS is loaded behind `next/dynamic` with `ssr:false`. The 2D view uses
the regular Mercator projection; the 3D view uses MapLibre's native `globe`
projection. `setProjection` plus a short `easeTo` changes the projection in the
same map instance, which keeps the transition soft and avoids a second WebGL
engine. There is no Three.js or `react-globe.gl` runtime dependency.

- `EXACT` — green point; selection is additionally shown by the larger selected radius;
- `PROBABLE` — amber point with the same geometry and a distinct precision colour;
- `APPROXIMATE` — list/review data only; its stored radius is retained for detail
  and review, but it never becomes a map/globe geometry;
- `UNKNOWN` never exists as a `Place`; `REJECTED` is excluded, as in 2D.

New city-like approximate resolutions use 10 km. Existing rows keep their stored
radius until an explicitly authorized data correction; the UI never disguises a
persisted 25 km value as 10 km.

Places are rendered from the same GeoJSON source in both projections. MapLibre's
native spatial clusters are used when zoomed out; clicking a cluster drills in.
The clustering is entirely client-side: no bbox query, no map pagination, no
second source of truth.

### 10.4 Texture

A static local PNG generated from the public-domain Natural Earth 1:110m country
polygons as a Web Mercator raster (`npm run places:generate-earth-texture`, 32.6 KiB). Source, licence and
attribution are recorded in `public/places/ATTRIBUTION.md`, and the credit is shown
in the globe view. The raster uses Web Mercator's ±85.051129° limits, so the small
polar caps beyond those latitudes intentionally show the globe background rather
than stretched texture. No provider, no key, no recurring cost.

### 10.5 Fallback, motion and accessibility

WebGL2 is probed **before** the MapLibre canvas is requested. Without it, neither the
2D map nor the globe is offered because MapLibre is the shared engine; a globe deep
link is corrected and an explicit message explains that only the list, selection and
filters remain usable. Under
`prefers-reduced-motion` camera moves and projection changes are instant. There
is no auto-rotation. The segmented `2D | 3D` control is a pair of real buttons
with `aria-pressed`; the list drawer and the focus-revealed map button group remain
the keyboard paths, and the globe never traps focus.

### 10.6 Cost

There is no separate Three.js globe chunk: 2D and 3D share MapLibre and the same
data layers. The MapLibre harness was run locally with 100, 500 and 1000 synthetic
places, desktop and Pixel 7 viewport profiles, using the system Chromium and a
throwaway PostgreSQL container. In the configured-raster path, the 2D MapLibre
instance is already mounted; the “first render” column therefore measures the
latency from the 3D click to the first render after the projection switch, not a
cold engine download.

| Places | Desktop first render / FPS | Mobile viewport first render / FPS |
| ---: | ---: | ---: |
| 100 | 946 ms / 35 fps | 990 ms / 24 fps |
| 500 | 861 ms / 38 fps | 1191 ms / 24 fps |
| 1000 | 835 ms / 37 fps | 964 ms / 23 fps |

The first-render budget passes (<3 s), but the FPS budget is **not validated** in
this environment: the measured WebGL renderer was SwiftShader, yielding 35–38 fps
desktop versus the 50–60 fps target and 23–24 fps mobile viewport versus the 30 fps
minimum. The mobile profile is a Pixel 7 viewport on the local Chromium host, not a
physical phone GPU benchmark; rerun the same harness on a real GPU before treating
D6 as accepted. This configured-raster run counted 144/99, 153/96 and 148/96
MapLibre render events over roughly 4 s (desktop/mobile, respectively), using one
fixed-duration camera animation per profile. `places:measure-globe` accepts `PLAYWRIGHT_EXECUTABLE_PATH`
so the check does not require a separately downloaded Playwright browser. Compile
the measurement build with `NEXT_PUBLIC_PLACES_BENCHMARK=1`; normal production
builds keep the benchmark-only window instrumentation disabled.

With a raster provider configured, the initial `/places` navigation loaded 12 JS
scripts totaling 492,335 encoded wire bytes; switching to 3D requested zero new JS
scripts. The historical 4.2 KiB / 1.08% and 1.86 MiB figures in the Phase I
Three.js record are not comparable to this shared MapLibre renderer.

## 11. Deliberately out of scope

Deep multimodal analysis (Phase H), the VPS worker, MCP and Hermes, viewport/bbox
querying, map pagination and any optimization aimed at tens of thousands of points.
