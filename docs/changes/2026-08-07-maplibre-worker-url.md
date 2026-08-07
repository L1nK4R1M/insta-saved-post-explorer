# MapLibre worker URL — blank Places map on develop

Status: fix for a defect introduced by PR #57 (`78b3bbf`), found on the develop
Preview on 7 August 2026. Production was never affected: it still serves the
Leaflet renderer, and the promotion PR #61 was still a draft.

## Symptom

`/places` rendered its raster tiles, its controls, its statistics and its
accessibility list, but **not a single place, cluster or icon**. No console
error, no failed request, no MapLibre error event. The page looked healthy and
was empty.

## Root cause

MapLibre GL JS 6 ships its worker as a separate ESM file and locates it itself:

```js
function di() {
  let e = import.meta.url;
  if (!/^https?:/.test(e)) return ``;          // ← empty string
  return new URL(`./maplibre-gl-worker.mjs`, e).href;
}
```

Turbopack does not expose an `http(s)` `import.meta.url` inside the bundled
chunk, so this returns `""` and MapLibre builds `new Worker("", { type: "module" })`.

That call does not throw. An empty URL resolves against the current document, so
the worker loads the HTML page as a module script, dies on the parse error and
closes — silently. Every GeoJSON source then stays unloaded forever. Raster tiles
are unaffected because they never reach the worker, which is exactly why the map
looked like it was working.

## Evidence

Measured on the develop Preview, then reproduced locally against a disposable
PostgreSQL 16 container seeded with 182 places (122 renderable) and a local tile
server, on a production build. Same build, same data, same tiles; the only
difference is the `setWorkerUrl` call:

| Observation | Without the fix | With the fix |
| --- | --- | --- |
| Worker URL passed to `new Worker` | `""` → resolves to the page | `/maplibre/maplibre-gl-worker.mjs` |
| Worker lifecycle | created → **closed** | created, stays alive |
| `map.isSourceLoaded("places")` | `false` | `true` |
| `map.querySourceFeatures("places")` | `0` | `19` |
| Rendered cluster/pin features | `0` | `12` |
| Features on the source | 122 | 122 |

The source always held its 122 features. Only the worker round-trip was missing.

## Fix

`setWorkerUrl("/maplibre/maplibre-gl-worker.mjs")` is called before the map is
constructed, and only when MapLibre's own resolver returned nothing — so if a
future MapLibre or bundler resolves the URL correctly, its answer wins.

The worker imports `./maplibre-gl-shared.mjs` as a sibling, so both files are
served from `public/maplibre`. `scripts/places/sync-maplibre-worker.mjs` copies
them from the installed package and runs on `prebuild`, so the vendored copy
cannot drift from `node_modules`. Its `--check` mode fails instead of writing,
and a missing dist file is a hard error rather than a silent blank map.

`public/maplibre` is added to the ESLint ignore list: it is minified vendor
output, not source.

## Why no test caught it

The Places e2e environment has no database, so the page renders its empty state —
there is never a marker to assert on. The suite could only check that a canvas
was visible, which a completely blank map satisfies.

The regression test added here asserts the defect itself instead of the pixels,
so it works without data: MapLibre must construct its worker from a served URL,
that asset must return 200, and the empty string is named explicitly as the
failure mode. Verified RED before the fix and GREEN after.

## Verification

| Gate | Result |
| --- | --- |
| `eslint . --max-warnings=0` | PASS — exit 0 |
| `npm run typecheck` | PASS |
| `npm run test` | PASS — 369 passed, 132 environment-bound skips |
| `npm run build` | PASS, prebuild sync reports in sync with maplibre-gl 6.1.0 |
| `npx playwright test` | PASS — 42 passed, 6 skipped, 48 scenarios |
| New scenario RED without the fix | PASS — fails on the worker-URL assertion |
| Repository state after build | clean |

## Limits

- The 132 skips are the PostgreSQL suites, which need `TEST_DATABASE_URL`.
- The local reproduction used a 1×1 PNG tile server, so the screenshots show a
  flat background. This exercises the raster path without a provider key; it says
  nothing about real tile rendering.
- Serving the worker separately means the 468 KB shared chunk is downloaded once
  more for the worker context. That is how MapLibre is normally deployed, but it
  is a real cost and it is not measured here.
- The D6 FPS budget remains derogated and unmeasured; this change does not touch
  it.
