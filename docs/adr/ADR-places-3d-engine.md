# ADR — 3D engine for the Places globe (Phase I)

- **Status: PROPOSED** — not accepted. The owner must choose the engine before any production code.
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

## 8. Recommendation

**Option A′ — Three.js via `globe.gl` / `react-globe.gl`.**

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

## 9. Consequences if A′ is accepted

- New client-only dependencies: `react-globe.gl` (+ `three` transitively), lazy-loaded.
- One new component `PlacesGlobe3D`, mirroring the existing `PlacesMap` prop contract.
- A public-domain Earth texture and a country-polygon GeoJSON served as static assets (no provider call).
- `view=map|globe` added to the URL contract (additive; existing links keep working).
- No server change, no API change, no Prisma migration.
- Terrain and 3D buildings are explicitly **not** delivered by Phase I.

## 10. Decisions still open (owner)

1. **Engine**: A′ (recommended), A, B or C.
2. **Visual concept**: Concept 1 (cinematic), 2 (Apple-Plans sober) or 3 (travel exploration) — see the brief.
3. **Texture / basemap source for the globe** and, if B or C is chosen, the terrain/tile provider and its budget.
4. **2D ↔ 3D behaviour**: shared camera or independent camera per view; does the globe become the default landing view?
5. **Mobile**: full globe on mobile, or 2D-only on small screens with an opt-in?
6. **Performance budget**: acceptable added bundle weight and target frame rate.

## 11. Re-evaluation triggers

Revisit this ADR if any of the following becomes true:

- photorealistic **terrain** or **3D buildings** become a requirement → re-score with those criteria weighted ≥ 8; Cesium likely wins;
- the owner decides to **unify 2D and 3D on one engine** → MapLibre becomes the candidate and the Phase G stack decision is reopened;
- the dataset grows **well beyond ~1000 places**, or per-viewport loading becomes necessary;
- the measured bundle or frame rate misses the budget agreed in §10.6;
- `globe.gl` / `react-globe.gl` becomes unmaintained → fall back to raw Three.js (Option A) behind the same contract.
