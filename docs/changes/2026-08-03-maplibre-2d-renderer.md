# MapLibre Places renderer — 2D and globe projection

Status: unmerged working-tree follow-up to historical Phase G.

## Scope

- Replace the client-side Places Leaflet/`leaflet.markercluster` renderer with
  MapLibre GL JS and native GeoJSON clustering.
- Replace the separate `react-globe.gl`/Three.js scene with MapLibre's native
  `globe` projection on the same map instance.
- Preserve the existing raster tile URL and mandatory attribution contract.
- Preserve selection, hover callouts, reduced-motion viewport changes, approximate
  precision in list/review, keyboard selection, and the 2D/3D renderer seam.
- Preserve the server/data APIs, auth, category work, and local Natural Earth
  texture asset.

## Implementation notes

- MapLibre is imported lazily inside `PlacesMap`.
- Mercator and globe use one canvas, one GeoJSON source and one set of layers;
  switching calls `setProjection` and a short `easeTo` instead of remounting a
  second renderer.
- The local Web Mercator Earth image is an optional MapLibre image source used
  as the globe base layer; no remote glyphs, terrain provider or 3D service was
  added.
- Raster sources retain the provider's `maxzoom: 19` cap.
- Category emojis are rasterized into local MapLibre images instead of relying on
  a remote glyph endpoint; precision colors remain separate from the icon layer.
- A `ResizeObserver` keeps the MapLibre canvas aligned with the absolute/flex
  layout used by the Places stage.
- `react-globe.gl`, `three` and the old `places-globe.tsx` renderer were removed
  from the application. `three-globe` remains only as a build-time source-data
  dependency for the existing reproducible texture generator.
- Historical PR/merge ledgers remain unchanged; this note records the unmerged
  follow-up explicitly.

## Verification

- `npm test -- --run`: 49 files passed, 369 tests passed; 11 PostgreSQL suites
  skipped because no DSN.
- `tests/unit/places-map-a11y.test.tsx`: accessible map selection buttons cover
  keyboard selection and `aria-pressed` state.
- `npm run typecheck`, `npm run lint` and `npm run build`: PASS.
- MapLibre style-spec validation of `buildMapStyle`: PASS.
- Browser smoke of `/places` with a public raster URL: full-width 1238×425
  MapLibre canvas, controls, attribution, 18 raster requests, no Leaflet
  container and no browser JavaScript errors.
- Isolated MapLibre feature smoke: cluster, pin and local icon-image layers rendered
  with zero console errors; approximate places remain out of map/globe geometry per
  REQ-001.
- System Chromium is installed locally (`Chromium 150.0.7871.128 snap`). The
  Playwright config accepts the explicit `PLAYWRIGHT_EXECUTABLE_PATH` override;
  with `/usr/bin/chromium-browser`, `tests/e2e/places-globe.spec.ts` passed 6/6
  with and without a configured public raster URL. The desktop e2e project passed
  40 tests with 6 deliberately mobile-only skips.
- `places:measure-globe` now drives a fixed-duration `MapLibre easeTo` animation
  through a real 180° bearing change, counts real MapLibre `render` events and
  logs frames/elapsed time; its
  benchmark-only hook is enabled through localStorage and is absent from normal
  URLs. It waits for DOM readiness and the 3D control rather than `networkidle`,
  which is incompatible with persistent tile requests. Against an isolated local
  PostgreSQL 16 container with a configured raster URL and system Chromium
  (`PLAYWRIGHT_EXECUTABLE_PATH=/usr/bin/chromium-browser`), 100/500/1000 places
  measured 35/38/37 fps desktop and 24/24/23 fps on the Pixel 7 viewport; first
  render stayed between 835 and 1191 ms (projection-switch latency on the shared
  MapLibre instance). The first-render budget passed, but FPS
  did not meet D6 (50–60 desktop, at least 30 mobile). The WebGL renderer was
  SwiftShader, so this is a host software-renderer result, not physical GPU
  evidence; rerun on a real GPU before accepting D6. The container was disposable
  and removed after the run.
- With a raster provider configured, the initial `/places` navigation loaded 12 JS
  scripts totaling 492,335 encoded wire bytes; switching to 3D requested zero new
  JS scripts. Historical Three.js bundle figures are not comparable to this
  shared MapLibre renderer.
