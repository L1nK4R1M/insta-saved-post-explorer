# ADR — 3D engine for the Places globe (Phase I)

- **Status: ACCEPTED** — decided by the owner on 25 July 2026.
- **Decision: Option A′ — Three.js via `react-globe.gl` / `globe.gl`.**
- Date: 25 July 2026
- Deciders: repository owner (sole decider), Claude (analysis)
- Scope: Phase I only — the 3D Places globe. Phase G (2D) is complete and must be preserved.
- Supersedes: nothing. Related: `docs/phase-i-places-3d-brief.md`, `docs/places-ui.md`.

## 1. Context

Phase G shipped `/places`: a Leaflet 2D map with `leaflet.markercluster`, Geoapify
raster tiles, a synchronized list, filters, statistics, a detail sheet, review
actions and URL deep links. The whole owner-scoped set of canonical places is
loaded once client-side and filtered in the browser.

Phase I adds a **3D globe view that complements — never replaces — the 2D map**.
Selection, filters, search and the detail panel must stay coherent across both
views.

## 2. Constraints (from `AGENTS.md`, the owner and the shipped code)

| # | Constraint |
| --- | --- |
| C1 | Personal application, single owner, **< ~1000 canonical places**. |
| C2 | **Leaflet 2D must be preserved.** Replacing Leaflet is explicitly out of scope. |
| C3 | Low or zero recurring cost; no new paid provider without an explicit decision. |
| C4 | Premium, fluid visual result; no over-engineering. |
| C5 | Low maintenance — the owner is the only maintainer. |
| C6 | 2D users must **not** download the 3D engine (lazy, client-only). |
| C7 | No second source of truth: the globe consumes the existing `PlacesMapItem` view model; no direct Prisma, no bypass of server services. |
| C8 | Accessible fallback required (no WebGL, `prefers-reduced-motion`, keyboard); the map is never the only path to the data. |
| C9 | Must represent continents, countries, cities, exact places and **APPROXIMATE zones** honestly. |
| C10 | Existing URLs must keep working; the view is an additive URL parameter. |

## 3. Options compared

Facts below (versions, licences, package weight) were read from the npm registry
on 25 July 2026. **`unpackedSize` is repository weight, not bundle size** — it
includes sources, examples and maps. The real runtime cost must be measured with a
bundle report during implementation (task T9); it is not asserted here.

### Option A — Three.js, hand-built globe

`three@0.185.1`, MIT, unpackedSize ≈ 23 MB.

- **Globe**: a textured sphere you build yourself. Total graphic freedom (atmosphere, glow, bloom, arcs).
- **Camera**: you own orbit/zoom/fly-to. `OrbitControls` helps; a smooth "fly to lat/lon" is manual spherical/quaternion work — the main difficulty.
- **Projection**: lat/lon → unit sphere is a few lines of spherical math, **pure and directly unit-testable** (good for our test plan).
- **Clustering/aggregation**: not provided — country/continent aggregation must be written.
- **Terrain / 3D buildings**: none realistically.
- **Accessibility**: canvas only; the DOM fallback must come from our own list/detail (already exists).
- **Cost**: zero. Earth textures can be public-domain (e.g. NASA Blue Marble) and self-hosted.
- **Maintenance**: we own the globe code — small surface if kept simple, but it is ours.
- **Leaflet compatibility**: total; an independent component, no interaction with Leaflet.

### Option A′ — Three.js via `globe.gl` / `react-globe.gl` *(variant, recommended)*

`globe.gl@2.46.1` (MIT) / `react-globe.gl@2.38.0` (MIT), Three.js underneath.

Same engine and same zero-cost/zero-provider profile as A, but the library already
provides exactly the primitives Phase I needs: **points/markers on a globe, country
polygons, rings, arcs, labels, `pointOfView()` fly-to, and built-in
auto-rotation**. It removes most of the custom camera and layer code that makes
option A costly, in exchange for one more dependency.

- **Aggregation**: country polygons come from a GeoJSON we supply (public-domain world atlas), enabling continent/country views without inventing clustering.
- **Trade-off**: less absolute freedom than raw Three.js, a mid-size community, and we inherit its release cadence.
- **Reversibility**: high — it wraps Three.js; dropping down to raw Three.js later keeps the same data contract.

### Option B — CesiumJS

`cesium@1.143.0`, Apache-2.0, unpackedSize ≈ 78 MB (the heaviest by far).

- **Globe**: native, real WGS84 geodesy; best-in-class geographic precision.
- **Terrain and 3D buildings**: genuinely first-class — the strongest reason to pick Cesium.
- **Performance at < 1000 entities**: fine; the engine's baseline cost dominates, not our data.
- **Cesium ion dependency**: default terrain and imagery come from ion — an account, a `NEXT_PUBLIC` token and a quota. There is a free tier.
- **Without ion**: workable — `EllipsoidTerrainProvider` (no terrain) plus a `UrlTemplateImageryProvider` pointed at our **existing Geoapify raster tiles**. But this removes terrain and photorealistic imagery, i.e. the very reason to choose Cesium.
- **Cost**: free tier, paid beyond; a new provider account either way if terrain is wanted.
- **Attribution**: Cesium ion and imagery attribution mandatory (we already display Geoapify attribution).
- **Bundle and build**: the heaviest, and it needs static worker/asset copying plus `CESIUM_BASE_URL` wiring — the most intrusive Next.js integration of the three.
- **Leaflet compatibility**: independent; no conflict, but two heavy mapping stacks coexist.

### Option C — MapLibre GL in globe / 3D mode

`maplibre-gl@6.0.0`, BSD-3-Clause, unpackedSize ≈ 19 MB. Globe projection landed in v5.

- **Globe**: a real globe projection (`projection: 'globe'`); switching 2D ↔ globe is essentially a projection toggle — the **most elegant 2D↔3D transition available**.
- **Terrain**: raster-DEM terrain; **3D buildings**: `fill-extrusion` from vector tiles.
- **The catch (decisive here)**: MapLibre's value comes from being **one engine for both 2D and 3D**. Realising it means **migrating the 2D map off Leaflet** — which constraint **C2 explicitly forbids in this phase**.
- Running MapLibre *only* for the globe next to Leaflet means two map engines, two tile/style configurations and duplicated marker logic — the worst maintenance outcome.
- **Provider**: terrain and buildings need **vector tiles + a DEM source** (MapTiler, Stadia…), i.e. a **new provider, key and cost**. Our current Geoapify subscription is raster.
- **Vendor lock**: moderate (the style spec is open, the tiles are not).

## 4. Weighted decision table

Weights reflect the constraints above (personal app, small dataset, preserve Leaflet,
low cost, low maintenance, premium look). Score 1–5, higher is better.

| Criterion | Weight | A (raw Three.js) | **A′ (globe.gl)** | B (Cesium) | C (MapLibre globe) |
| --- | --- | --- | --- | --- | --- |
| Preserves Leaflet 2D (C2) | 5 | 5 | 5 | 4 | 1 |
| Recurring cost (C3) | 5 | 5 | 5 | 3 | 2 |
| Maintenance burden (C5) | 5 | 2 | 4 | 2 | 2 |
| Fits < 1000 places without over-engineering (C1, C4) | 4 | 4 | 5 | 2 | 3 |
| Visual quality / premium feel (C4) | 4 | 5 | 4 | 5 | 4 |
| Bundle & build intrusiveness (C6) | 4 | 3 | 3 | 1 | 3 |
| Implementation effort to first usable globe | 3 | 2 | 5 | 2 | 3 |
| Terrain / 3D buildings capability | 2 | 1 | 1 | 5 | 4 |
| Geographic precision | 2 | 3 | 3 | 5 | 5 |
| No vendor lock (C3) | 3 | 5 | 5 | 3 | 3 |
| Accessibility fallback effort (C8) | 3 | 3 | 3 | 3 | 3 |
| **Weighted total** | **40** | **146** | **165** | **121** | **110** |

Computation is reproducible: multiply each score by its weight and sum. The ranking
is robust — A′ stays first unless terrain/3D buildings are re-weighted from 2 to ≥ 8,
which is exactly the trigger recorded in §9.

## 5. Costs

| Option | Recurring cost | New account | Notes |
| --- | --- | --- | --- |
| A / A′ | **€0** | none | Earth texture self-hosted (public domain). No tile requests for the globe. |
| B | €0 on ion free tier, paid beyond | Cesium ion (if terrain wanted) | Can run ion-free on our Geoapify raster, losing terrain. |
| C | Cost of a vector/DEM provider | MapTiler/Stadia or equivalent | Plus the hidden cost of migrating 2D off Leaflet. |

## 6. Risks

| Risk | Option | Mitigation |
| --- | --- | --- |
| Bundle regression for 2D-only users | all | Lazy `next/dynamic` + `ssr:false`, engine imported only when `view=globe`; measured in T9. |
| WebGL unavailable or blocked | all | Mandatory DOM fallback: keep list + detail, offer a link back to 2D (FR-I-12). |
| Motion sickness / accessibility | all | Honour `prefers-reduced-motion`: no auto-rotation, instant camera moves (FR-I-13). |
| Owning custom camera math | A | Choose A′, which provides `pointOfView()`. |
| Library abandonment | A′ | It wraps Three.js; the data contract is ours, so falling back to raw Three.js is contained. |
| Heavy build wiring (static assets, `CESIUM_BASE_URL`) | B | Only accept if terrain is a confirmed requirement. |
| Silent scope creep into a Leaflet migration | C | Forbidden by C2 in this phase; would require its own ADR. |

## 7. Reversibility

High for A′ and A. The globe is a **leaf component** behind the same contract as
`PlacesMap`: it consumes `PlacesMapItem[]`, reports selection upward, and owns no
data. Removing or swapping the engine touches one component plus the view toggle;
the 2D map, the data layer, the filters, the URL contract and the detail sheet are
untouched. Option B is less reversible because of its build-level wiring; option C
is the least reversible because its value implies migrating 2D.

## 8. Decision (accepted)

**Option A′ — Three.js via `react-globe.gl` / `globe.gl`.**

It is the only option that satisfies every hard constraint at once: Leaflet 2D
untouched, zero recurring cost and no new provider account, a premium-looking globe
with points, country polygons and smooth `pointOfView()` transitions for a small
amount of code, lazily loaded so 2D users pay nothing, and fully reversible behind
our own data contract. We do not get terrain or 3D buildings — and for the question
this view answers ("where in the world are my saved places?"), we do not need them.

Cesium remains the right answer **if and only if** photorealistic terrain or 3D
buildings become a stated requirement. MapLibre becomes the right answer **if and
only if** the owner decides to unify 2D and 3D on a single engine — a separate
decision that would supersede the Phase G stack and needs its own ADR.

### 8.1 Explicitly rejected

- **raw Three.js** for the first version — the custom camera and layer code is not worth it;
- **CesiumJS** — no realistic terrain or 3D buildings are required;
- **MapLibre for the 3D view** — its value implies unifying the engines;
- **replacing Leaflet** or migrating the existing 2D view — the Phase G stack stays.

Rationale recorded by the owner: the application stays around 1000 positions; no
realistic terrain or 3D building is required; priority to simplicity, fluidity,
maintainability and the absence of recurring cost; the 3D engine must stay isolated
behind our own rendering contract and be lazily loaded only when the 3D view is
requested.

## 9. Consequences

- New client-only dependencies: `react-globe.gl` (+ `three` transitively), lazy-loaded.
- One new component `PlacesGlobe3D`, mirroring the existing `PlacesMap` prop contract.
- A public-domain Earth texture and a country-polygon GeoJSON served as static assets (no provider call).
- `view=map|globe` added to the URL contract (additive; existing links keep working).
- No server change, no API change, no Prisma migration.
- Terrain and 3D buildings are explicitly **not** delivered by Phase I.

## 10. Decisions — all closed

| # | Decision | Resolution (owner, 25 July 2026) |
| --- | --- | --- |
| D1 | Engine | **`react-globe.gl` / `globe.gl`** (Three.js underneath). Raw Three.js, CesiumJS and MapLibre-for-3D rejected; Leaflet is not replaced and the 2D view is not migrated. |
| D2 | Visual concept | **Concept 2 (sober)** as the UX architecture, enriched with a few restrained Concept 1 elements: dark premium globe, light atmospheric halo, luminous points, smooth centring animation on selection. No permanent animated arcs, no excessive effects, no `/places` redesign. Segmented `2D \| 3D` control next to the filters; current controls, detail panel, filters, search, statistics and list all preserved. |
| D3 | Texture / provider | **Static, free, optimized Earth texture** showing continents, oceans and main borders. No 3D terrain, no 3D buildings, no dependency on Cesium ion, Mapbox or any paid service. Geoapify stays used **only** for the Leaflet 2D raster tiles. The exact source may be selected during implementation provided it is freely usable, repository-compatible, lightweight, served from the application assets (or an explicitly documented reliable source) and replaceable without touching the globe architecture. Its licence, source and attribution must be documented; **no texture with an unclear licence may be downloaded or committed.** |
| D4 | 2D ↔ 3D behaviour | Additive `view=map\|globe`; absent ⇒ `map`; **2D stays the default**; the 3D engine is not loaded when `view=map`. Filters, search, `placeId` selection, list, statistics and the detail panel are shared. **Independent cameras in v1**; the free camera is **not** stored in the URL. When a `placeId` is selected the active view centres on it, in both switch directions. Historical URLs without `view` stay valid. |
| D5 | Mobile and fallback | Full 3D allowed on capable mobiles; the globe loads only after the 3D view is explicitly selected; touch controls provided. **WebGL is detected before fully loading the engine**; if unavailable or failing, fall back cleanly to 2D with an understandable message while preserving selection, filters, list and detail. The map or globe is never the only way to reach places. `prefers-reduced-motion` respected. |
| D6 | Performance budget | No significant regression of the initial `/places` bundle in 2D; `react-globe.gl`, Three.js and globe assets lazy-loaded; **50–60 fps** target on recent desktop, **≥ 30 fps** minimum on capable mobile; validated with ~1000 places; **first globe render < 3 s** after opening it on a normal connection; optimized texture; no terrain, building, 3D model or unnecessary asset in v1. These are **measurable budgets** and the real measurements must be recorded in the final proof. |

### 10.1 Data representation (owner-confirmed)

`EXACT` and `PROBABLE` render as distinct points with a **clear visual difference**;
`APPROXIMATE` renders as a zone or halo **proportional to its radius**, never a fake
exact point; `UNKNOWN` and `REJECTED` are **never rendered** on the globe; visual
clustering applies when several places are close at world scale; no second source of
truth — `PlacesMapItem` is reused until evidence justifies a new server contract.

## 10.2 Historical implementation outcome (25 July 2026)

The historical Three.js implementation was completed as recorded. The later
MapLibre follow-up in §13 supersedes its runtime; the measurements below remain
evidence for that historical implementation only.

- `react-globe.gl` 2.38.0 and `three` 0.185.1 are pinned exactly and reach the browser
  only through a lazy chunk. The `/places` initial 2D payload grew by **4.2 KiB
  (+1.08 %)** and the 1.86 MiB engine chunk is absent from the 2D entry — the
  reversibility and no-cost-for-2D-users properties that justified this option hold
  in practice.
- D3 was satisfied without downloading anything: the texture is **generated** from
  public-domain Natural Earth data by a repository script, 36.5 KiB, licence and
  attribution documented.
- **One consequence is now measured rather than assumed.** A full-screen globe is
  fill-rate bound. On a device with `devicePixelRatio` 3 the engine rasterizes nine
  times the pixels of a logical one, so the renderer's pixel ratio is capped at 1.5;
  measured effect on an emulated Pixel 7: **12 → 18 fps**. The D6 frame-rate budgets
  were then **validated on real GPU hardware** (25 July 2026, NVIDIA GeForce RTX
  5090): 240 fps and 276–326 ms first render at 100, 500 and 1000 places. All D6
  budgets are met, and the fill-rate diagnosis is confirmed by measurement rather
  than expectation. Status `FPS_BUDGET_VALIDATED_ON_REAL_GPU`; both runs are kept in
  `changes/2026-07-25-phase-i-places-3d-implementation.md` §6.2.

## 11. Re-evaluation triggers

Revisit this ADR if any of the following becomes true:

- photorealistic **terrain** or **3D buildings** become a requirement → re-score with those criteria weighted ≥ 8; Cesium likely wins;
- the owner decides to **unify 2D and 3D on one engine** → MapLibre becomes the candidate and the Phase G stack decision is reopened;
- the dataset grows **well beyond ~1000 places**, or per-viewport loading becomes necessary;
- the measured bundle or frame rate misses the budget agreed in §10.6;
- `globe.gl` / `react-globe.gl` becomes unmaintained → fall back to raw Three.js (Option A) behind the same contract.

## 12. Superseding decision — MapLibre 2D migration (unmerged follow-up)

The owner later chose to replace the Leaflet 2D renderer with **MapLibre GL JS**.
This explicitly supersedes the no-migration constraint in C2 and the related D1
wording; it does not reopen the 3D engine decision.

The current 2D implementation uses MapLibre's native GeoJSON clustering and keeps
the existing Places renderer contract, Geoapify raster tiles, attribution, filters,
selection, hover callouts and fit-to-results behavior.
Because MapLibre requires WebGL2 for both projections, the shared renderer now gates
the 2D map as well as the globe; unsupported browsers keep the list, filters and
selection usable but do not receive a map canvas.

## 13. Superseding decision — MapLibre globe projection

On 3 August 2026 the owner requested a softer 2D ↔ 3D transition. The separate
`react-globe.gl`/Three.js renderer is therefore replaced by MapLibre's native
`globe` projection. Mercator and globe now share one MapLibre instance, one
GeoJSON source and the same interaction/accessibility contract; the transition
uses `setProjection` and a bounded `easeTo` rather than remounting a second
WebGL scene.

This decision deliberately chooses MapLibre's globe projection, not DEM terrain
or 3D building extrusions. If photorealistic terrain becomes a requirement, the
re-evaluation trigger in §11 still applies. The local Natural Earth image remains
the globe base and `three-globe` is retained only as a build-time source-data
dependency for regenerating that versioned texture.

This is an unmerged working-tree follow-up, not a replacement of the historical
PR #36 merge proof. Its local first-render budget passes; its FPS budget remains
open pending a real-GPU measurement because system Chromium uses SwiftShader.
The later critical points-only requirement `REQ-001` supersedes the historical
zone/halo rendering rule for this follow-up: only `EXACT` and `PROBABLE` reach the
map or globe; approximate precision remains available in list and review flows.
