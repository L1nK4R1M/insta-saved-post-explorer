# Phase I — Places 3D globe — entry brief

**Status: IMPLEMENTED — awaiting review.** T1–T10 are built on
`claude/phase-i-places-3d-implementation`; what was actually delivered, with all
measured values, is recorded in
`changes/2026-07-25-phase-i-places-3d-implementation.md`. This document remains the
design reference and is not rewritten by the implementation.
Last updated: 25 July 2026. Base: `develop` @ `8d5c1ee` (Phase G merged as `2bd2098`).

The owner approved every open decision on 25 July 2026 and
`docs/adr/ADR-places-3d-engine.md` is **ACCEPTED**. This document remains the design
reference; the implementation follows
`docs/superpowers/plans/2026-07-25-phase-i-places-3d.md` (T1–T10) in its **own PR**.
This PR stays documentation-only.

### Approved decisions (summary — authoritative detail in ADR §10)

| # | Decision |
| --- | --- |
| D1 | Engine: **`react-globe.gl` / `globe.gl`** (Three.js underneath), isolated behind our rendering contract and lazy-loaded. Raw Three.js, CesiumJS and MapLibre-for-3D rejected; **Leaflet is not replaced**, the 2D view is not migrated. |
| D2 | Visual: **Concept 2 (sober)** enriched with restrained Concept 1 elements — dark premium globe, light atmospheric halo, luminous points, smooth centring on selection; segmented `2D \| 3D` control next to the filters; no permanent animated arcs, no `/places` redesign. |
| D3 | Texture: **static, free, optimized** Earth texture (continents, oceans, main borders); no terrain, no 3D buildings, no Cesium ion / Mapbox / paid service. Geoapify stays **only** for the Leaflet 2D raster tiles. Licence, source and attribution must be documented; an unclear licence must not be committed. |
| D4 | `view=map\|globe` additive; absent ⇒ `map`; **2D remains default**; engine not loaded when `view=map`; filters, search, `placeId`, list, statistics and detail shared; **independent cameras in v1**, free camera not in the URL; the active view centres on the selected `placeId` in both switch directions; historical URLs stay valid. |
| D5 | Mobile: full 3D on capable devices, loaded only after explicit selection, touch controls; **WebGL detected before full engine load**; on failure fall back cleanly to 2D with a clear message, preserving selection/filters/list/detail; never the only path to the data; `prefers-reduced-motion` respected. |
| D6 | Budget: no significant 2D bundle regression; engine and assets lazy-loaded; **50–60 fps** recent desktop, **≥ 30 fps** capable mobile; validated at ~1000 places; **first globe render < 3 s**; optimized texture; no terrain/building/3D model in v1. Measurements must be recorded in the final proof. |

Authority order: `AGENTS.md` → `CODEX_IMPLEMENTATION_ORDER.md` §5 Phase I →
`CODEX_PLACES_EXTENSION.md` §13.5 → this brief → repo conventions.

---

## 1. Brownfield audit of Phase G

### 1.1 What exists

| File | Role | Phase I impact |
| --- | --- | --- |
| `src/app/places/page.tsx` | Server Component: loads the view model + stats, reads URL, no HTTP loop, no Prisma in components | **Reused unchanged** — the globe needs no new server call |
| `src/server/places/map-view.ts` | `loadPlacesMapView()` → `PlacesMapItem[]`, owner-scoped, cap `PLACES_MAP_MAX = 1000`, complete `sourceThemes`, one preview thumbnail | **Reused unchanged** — single source of truth for both views |
| `src/features/places/query-state.ts` | Pure: `parsePlacesUrlState`, `serializePlacesUrlState`, `filterPlaces`, `isMappable`, `collectCountries`, `narrowCountries`, `countActiveFilters`, `toggleValue` | **Extended additively** with a `view` field |
| `src/features/places/components/places-explorer.tsx` | Client orchestrator: owns `filters`, `selectedId`, `hover`, panels; renders map + list + detail + summary | **Extended** — becomes the shared shell that hosts either renderer |
| `src/features/places/components/places-map.tsx` | The only Leaflet-aware file; `next/dynamic` + `ssr:false` | **Untouched**, renamed conceptually to the 2D renderer |
| `src/features/places/components/place-detail-sheet.tsx` | Detail + review actions, remounts on `place.id` | **Reused unchanged** by both views |
| `src/features/places/actions.ts` | Server Actions: session-checked reads, admin-checked review writes | **Reused unchanged** |
| `src/app/globals.css` | 111 `.places-*` rules using the app design tokens | **Extended** with globe-specific rules |

### 1.2 Contracts that must be preserved

```ts
// The renderer contract Phase G established (places-map.tsx)
type PlacesMapProps = {
  places: readonly PlacesMapItem[];
  selectedId: string | null;
  onSelect: (placeId: string) => void;
  onHover: (place: PlacesMapItem | null, point: { x: number; y: number } | null) => void;
  tileUrl: string;
  tileAttribution: string;
};
```

`PlacesMapItem` already carries everything a globe needs: `latitude`, `longitude`,
`precision`, `approximationRadiusMeters`, `countryCode`, `country`, `city`,
`categoryGroup`, `sourceThemes`, `reviewStatus`, `isUserConfirmed`, `postCount`,
`previewThumbnailUrl`. **No new server field is required for Phase I.**

Rendering invariants inherited from Phase F/G and non-negotiable:

- `EXACT` / `PROBABLE` → a point;
- `APPROXIMATE` → an **area with its stored radius**, never a fake exact point;
- `UNKNOWN` → creates no `Place`, therefore never rendered;
- `REJECTED` → excluded from map and list (`isMappable`).

### 1.3 Gaps found by the audit

| # | Gap | Consequence for Phase I |
| --- | --- | --- |
| G1 | **The URL has no `view` parameter.** `parsePlacesUrlState` handles `q, theme, categories, precision, review, country, placeId` only. | A `view` field must be added **additively**; absent ⇒ `map`, so every existing link keeps working. |
| G2 | The hover callout is positioned from **2D container pixels** (`onHover(place, {x, y})`). | The globe must project its own screen coordinates or the callout must be re-anchored; the prop contract itself can stay. |
| G3 | `tileUrl` / `tileAttribution` are raster-tile concepts. | The globe needs a different asset (texture) — the shared shell must not assume tiles. |
| G4 | `places-explorer.tsx` renders `PlacesMap` directly, and gates it on `tilesConfigured`. | Extract a small renderer-selection seam so the shell hosts either renderer without duplicating list/filters/detail. |
| G5 | No WebGL capability detection anywhere. | Required for the 3D fallback. |
| G6 | `prefers-reduced-motion` is honoured in the 2D map only. | The globe must honour it too (no auto-rotation, instant camera moves). |

---

## 2. Requirements

Identifiers are stable and used by the traceability matrix.

### 2.1 Functional

| ID | Requirement | Measurable criterion |
| --- | --- | --- |
| FR-I-01 | A 3D globe view is reachable from `/places` | `view=globe` renders the globe; `view=map` renders Leaflet |
| FR-I-02 | The 2D view remains the default and is unchanged | No `view` param ⇒ Leaflet renders exactly as today; Phase G e2e suite still green |
| FR-I-03 | An explicit, visible 2D ↔ 3D control | A labelled control toggles the view in ≤ 1 interaction, from both views |
| FR-I-04 | Filters are shared across views | Applying a filter in 2D then switching to 3D shows the same filtered set (same `filterPlaces` output) |
| FR-I-05 | Search is shared across views | The `q` term survives the switch and narrows both renderers identically |
| FR-I-06 | Selection is shared across views | Selecting a place in one view keeps it selected after switching; the globe centres on it |
| FR-I-07 | The detail sheet is view-agnostic | The same `PlaceDetailSheet` opens from either view with identical content and review actions |
| FR-I-08 | Deep links carry the view | `?view=globe&placeId=X` restores view + selection on load; back/forward work |
| FR-I-09 | Existing URLs keep working | Every Phase G URL renders the 2D view with identical results |
| FR-I-10 | Precision is rendered honestly in 3D | `EXACT`/`PROBABLE` as points; `APPROXIMATE` as an area sized from `approximationRadiusMeters`; `UNKNOWN` absent; `REJECTED` absent |
| FR-I-11 | Aggregation by continent/country | Zoomed out, places aggregate; a country/continent can be focused and drills down to its places |
| FR-I-12 | Fallback without WebGL | If WebGL is unavailable, the globe is not offered (or degrades) and the list + detail + 2D remain fully usable, with an explicit message |
| FR-I-13 | Reduced motion respected | With `prefers-reduced-motion: reduce`: no auto-rotation, no animated fly-to; camera jumps instantly |
| FR-I-14 | Keyboard accessible | Selection reachable without a pointer via the list; the globe never traps focus; controls are real buttons |
| FR-I-15 | Attribution displayed | The globe displays the attribution required by the chosen basemap/texture source |
| FR-I-16 | Mobile behaviour | Full 3D on capable mobiles, loaded only after explicit selection, with touch controls (D5) |

### 2.2 Non-functional

| ID | Requirement | Measurable criterion |
| --- | --- | --- |
| NFR-I-01 | 2D users pay nothing | The 3D engine is absent from the initial `/places` payload; loaded only when the globe is requested — proven by a bundle report |
| NFR-I-02 | Fluidity | **50–60 fps** on recent desktop and **≥ 30 fps** on capable mobile while rotating with ~1000 places (D6) |
| NFR-I-03 | Time to first globe | **First globe render < 3 s** after opening the 3D view on a normal connection (D6) |
| NFR-I-04 | No second source of truth | The globe consumes `PlacesMapItem[]` from the existing loader; no direct Prisma, no new endpoint, no extra fetch |
| NFR-I-05 | No recurring cost | No paid provider at all: static free texture, no Cesium ion / Mapbox (D3) |
| NFR-I-06 | Reversibility | Removing the globe touches the globe component + view toggle only; 2D, data, filters, URL and detail keep working |
| NFR-I-07 | No regression | Full unit + e2e suites green; no Prisma migration; no API contract change |
| NFR-I-08 | Maintainability | The 3D-specific code stays confined to the globe component and one pure projection module |

### 2.3 Acceptance criteria (phase exit gate)

Derived from `CODEX_IMPLEMENTATION_ORDER.md` §5 Phase I plus the above:

1. The globe and the 2D map use the **same data source** and the same filtered set.
2. **No second backend service** exists for the globe; no new endpoint, no migration.
3. Selection, filters, search and detail are synchronized in both directions.
4. `view` is in the URL; back/forward and shared links work; old links are unaffected.
5. `APPROXIMATE` is an area, `UNKNOWN`/`REJECTED` never appear.
6. Stable behaviour on desktop with a **reasonable mobile fallback**.
7. Reduced motion and no-WebGL paths are implemented and tested.
8. The Phase G 2D experience is provably unchanged (its e2e suite still green).
9. Bundle evidence shows the 3D engine is not shipped to 2D-only users.

---

## 3. Target architecture

### 3.1 Component structure

```mermaid
flowchart TD
  P["app/places/page.tsx (Server Component)"] -->|PlacesMapItem[] + stats| S
  S["PlacesExplorer (client shell)<br/>filters · selection · panels · URL"] --> R{"view?"}
  R -->|map| M["PlacesMap2D<br/>(Leaflet — unchanged)"]
  R -->|globe| G["PlacesGlobe3D<br/>(lazy, client-only)"]
  S --> L["List drawer"]
  S --> D["PlaceDetailSheet"]
  S --> F["Filters · Stats · Summary"]
  M -.->|onSelect / onHover| S
  G -.->|onSelect / onHover| S
  D --> A["Server Actions (session-checked)"]
```

The shell owns all state. Both renderers are **leaf components** with the same
contract: they receive the already-filtered places plus `selectedId`, and report
selection/hover upward. Neither owns data.

### 3.2 Shared renderer contract

```ts
// Target contract — extends the Phase G contract without breaking it.
type PlacesRendererProps = {
  places: readonly PlacesMapItem[];   // already filtered by the shell
  selectedId: string | null;
  onSelect: (placeId: string) => void;
  onHover: (place: PlacesMapItem | null, point: ScreenPoint | null) => void;
};

type PlacesMap2DProps  = PlacesRendererProps & { tileUrl: string; tileAttribution: string };
type PlacesGlobe3DProps = PlacesRendererProps & { textureUrl: string; attribution: string; reducedMotion: boolean };
```

Tile-specific props stay on the 2D renderer (gap G3); globe-specific props stay on
the globe. The shell passes what each needs.

### 3.3 URL and state

- `view=map|globe`, **additive**; absent ⇒ `map` (FR-I-09).
- Filters, `q`, `placeId` are unchanged and shared.
- **Camera state is deliberately not in the URL** in v1 (D4): a globe camera is
  continuous and would pollute history. Selection (`placeId`) already restores a
  meaningful viewpoint.
- Cameras are **independent per view** (D4); switching re-frames from the shared
  selection — 2D → 3D centres the globe on it, 3D → 2D centres Leaflet on it — or
  fits all results when nothing is selected.

### 3.4 Loading strategy

`next/dynamic(..., { ssr: false })` for the globe, imported **only** when
`view === "globe"` — so a 2D-only session never downloads the engine (NFR-I-01).
A skeleton renders while the chunk loads. WebGL is probed before offering the view
(FR-I-12).

### 3.5 3D view model

No new server data. One **pure** client module converts the existing item into
scene data:

- `latLonToVec3(lat, lon, radius)` — spherical projection, pure and unit-testable;
- `approximateRadiusToAngularRadius(meters)` — metres → angular size for the zone ring;
- `aggregateByCountry(places)` / `aggregateByContinent(places)` — reuses `countryCode`
  and the existing continent code; no new taxonomy.

Keeping this module pure is what makes FR-I-10, FR-I-11 and NFR-I-08 testable
without a browser.

### 3.6 Explicit prohibitions

The globe must not: access Prisma; bypass the server services; create a second
source of truth; break existing URLs; force the 3D engine on 2D users; duplicate
the filter, list or detail logic; or replace Leaflet.

---

## 4. Three UX concepts

The owner picks **one** (ADR §10.2). All three respect the same invariants
(APPROXIMATE as an area, UNKNOWN/REJECTED absent, shared filters/selection/detail,
attribution visible).

### Concept 1 — Cinematic globe — *not selected (elements borrowed)*

Immersive, dark, full-bleed globe; luminous points; a subtle atmospheric halo;
animated fly-to on selection; floating glass detail panel.

```text
DESKTOP                                   MOBILE
┌──────────────────────────────────────┐  ┌───────────────┐
│  [search]            [Filtres] [2D◐3D]│  │ [search][⚙][2D]│
│                                       │  ├───────────────┤
│              ✦   ✦                    │  │               │
│         ✦   ((●))   ✦     ← glow      │  │      ✦ ●      │
│            ✦     ✦                    │  │    ((●))      │
│  ┌───────────────┐                    │  │      ✦        │
│  │ detail (glass)│                    │  ├───────────────┤
│  └───────────────┘         42 lieux   │  │ ▔ bottom sheet│
└──────────────────────────────────────┘  └───────────────┘
```

- **2D/3D control**: prominent segmented control, top right.
- **Selection**: animated fly-to + point pulse; list stays in sync.
- **Detail**: floating translucent panel (bottom-left desktop, bottom sheet mobile).
- **Clusters**: glowing aggregated halos sized by count.
- **APPROXIMATE**: soft translucent disc scaled from the real radius.
- **Pros**: highest wow factor; showcases travel data.
- **Cons**: furthest from the current sober design; animation cost; reduced-motion path removes much of its identity.
- **Complexity**: **high**.

### Concept 2 — Sober globe (Apple-Plans continuity) — ✅ **SELECTED**

The Phase G chrome exactly as-is; only the canvas changes.

```text
DESKTOP                                   MOBILE
┌──────────────────────────────────────┐  ┌───────────────┐
│  [search]            [Filtres] [2D|3D]│  │ [search] [⚙]  │
│                                       │  │  [ 2D | 3D ]  │
│              ● ●                      │  ├───────────────┤
│           ●  ( ● )  ●                 │  │      ● ●      │
│              ● ●                      │  │    ( ● )      │
│  ┌───────────────┐                    │  │               │
│  │ detail sheet  │  42 · 128 · 3 ⚑    │  ├───────────────┤
│  └───────────────┘                    │  │ ▔ sheet       │
└──────────────────────────────────────┘  └───────────────┘
```

- **2D/3D control**: small segmented control beside **Filtres** — same visual language.
- **Selection / detail / clusters**: identical to Phase G, only projected on a sphere.
- **APPROXIMATE**: dashed ring, same semantics as the 2D circle.
- **Pros**: perfect design continuity; smallest surface; cheapest to test and maintain; reduced-motion costs nothing.
- **Cons**: least spectacular.
- **Complexity**: **low**.

### Concept 3 — Travel exploration — *not selected*

Discovery-oriented, progressive drill-down world → continent → country → city → place,
with photos foregrounded.

```text
DESKTOP                                   MOBILE
┌──────────────────────────────────────┐  ┌───────────────┐
│ Monde › Europe › Italie   [2D|3D]     │  │ Monde › Europe│
│ ┌────────┐                            │  ├───────────────┤
│ │Europe 12│    ((9))   ← country       │  │    ((9))      │
│ │Asie   7 │   ●   ●      bubbles       │  │   ●    ●      │
│ │Afrique2 │                            │  ├───────────────┤
│ └────────┘  ▣▣▣ photo strip           │  │ ▣▣▣ photos    │
└──────────────────────────────────────┘  └───────────────┘
```

- **2D/3D control**: in the breadcrumb bar.
- **Selection**: each drill-down level re-frames the camera; the final level opens the detail.
- **Clusters**: count bubbles per continent/country, then individual points.
- **APPROXIMATE**: area shown at city level, aggregated above it.
- **Pros**: best use of country/continent statistics; genuinely "explorable".
- **Cons**: new navigation model to specify and test (breadcrumb state, its own URL semantics); the largest deviation from Phase G.
- **Complexity**: **medium-high**.

**Owner decision: Concept 2**, enriched with restrained Concept 1 elements — a dark
premium globe, a light atmospheric halo, luminous points and a smooth centring
animation on selection. Explicitly excluded: permanent animated arcs, excessive
visual effects and any redesign of `/places`. The existing controls, detail panel,
filters, search, statistics and list are all preserved.

---

## 5. Test strategy

| Kind | Coverage |
| --- | --- |
| Unit (pure) | `latLonToVec3` (poles, meridian, antimeridian, sign conventions); metres → angular radius; country/continent aggregation; `view` parsing/serialization; unknown `view` value falls back to `map` |
| Unit (state) | Filters shared across views; selection preserved across a view switch; `UNKNOWN`/`REJECTED` excluded from both renderers |
| Integration | `/places?view=globe` renders the globe shell; `/places` renders 2D; detail sheet identical from both; review actions unaffected |
| e2e | View toggle both ways; deep link `?view=globe&placeId=…`; back/forward; filter then switch; keyboard path; mobile viewport; no-WebGL fallback (WebGL stubbed); `prefers-reduced-motion` |
| Performance | ~1000 synthetic places: frame rate probe and interaction responsiveness (NFR-I-02) |
| Bundle | Report proving the 3D chunk is absent from the 2D entry (NFR-I-01) |
| Non-regression | The whole Phase G e2e suite must stay green untouched (FR-I-02) |

The 3D engine and any texture/tile request are **mocked** in automated tests; no
network call to a map provider in CI.

---

## 6. Scope

**In scope**: the 3D globe view, the view toggle, shared state, the pure 3D view
model, fallbacks, tests and documentation.

**Out of scope**: Phase E (worker), Phase H (OCR/transcription/video/multimodal),
Phase J (MCP/Hermes), Redis, any Prisma migration, changing Geoapify, **replacing
Leaflet**, and any redesign of `/places` beyond adding the view.

## 7. Next action

1. ✅ Decisions approved and recorded (ADR §10, `ACCEPTED`). **Gate closed.**
2. ✅ T1 → T10 implemented on `claude/phase-i-places-3d-implementation`. Leaflet is
   not replaced and no migration was introduced.
3. ✅ Real measurements recorded. Bundle and time-to-first-render budgets are **met**;
   the D6 **frame-rate** budgets could not be validated because the CI container has
   no GPU, and the evidence for that conclusion is in the change record §6.3.
4. ⏳ **Open owner decision**: accept the phase with the frame-rate budgets pending a
   run on a GPU device, or hold it until `npm run places:measure-globe` has been run
   on real hardware. Phase I must not be marked COMPLETE while this is open.
