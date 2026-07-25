# Change record — Phase I: Places 3D globe, implementation

- Date: 25 July 2026
- Branch: `claude/phase-i-places-3d-implementation` (from `develop` `3fef818`)
- Design pack: PR #35, squash `3fef818`; ADR `ACCEPTED`
- VibeSpec route: **Critical** — implementation stage of the route whose design and
  ADR gates are already closed.
- Tasks: **T1 → T10** of `superpowers/plans/2026-07-25-phase-i-places-3d.md`

## 1. Architecture actually implemented

```text
app/places/page.tsx (Server Component, unchanged data path)
  └─ PlacesExplorer  ── owns filters, search, selection, panels, URL, capabilities
       ├─ PlacesRenderer  ── the seam: picks one renderer, lazily
       │    ├─ PlacesMap    (Leaflet, unchanged)          view=map
       │    └─ PlacesGlobe  (react-globe.gl, lazy)        view=globe
       ├─ list drawer · statistics · filters · summary    shared
       └─ PlaceDetailSheet + Server Actions               shared
```

| File | Role |
| --- | --- |
| `src/features/places/renderer-contract.ts` (new) | The contract both renderers honour: already-filtered places, `selectedId`, `onSelect`, `onHover`. Engine-specific props stay off it. |
| `src/features/places/components/places-renderer.tsx` (new) | The seam. Renders one of three **resolved** states — `map`, `globe`, `probing` — and the globe component is referenced on the `globe` branch only. |
| `src/features/places/components/places-globe.tsx` (new) | The **only** file importing the 3D engine. Binds the pure scene to `react-globe.gl`, forwards interaction, releases the WebGL context on unmount. |
| `src/lib/places/globe-projection.ts` (new) | Pure: projection, longitude wrapping, metres → arc, geodesic circles, spherical centroid, country/continent aggregation, level of detail. No React, no engine. |
| `src/lib/places/webgl.ts` (new) | Capability probe: `supported` / `unsupported` / `failed`. Imports nothing 3D. |
| `src/features/places/capabilities.ts` (new) | `useWebGlSupport` and `usePrefersReducedMotion` via `useSyncExternalStore`. |
| `src/lib/places/globe-texture.ts` (new) | The texture URL and its attribution string. |
| `scripts/places/generate-earth-texture.mjs` (new) | Generates the texture from public-domain data. |
| `scripts/places/measure-globe.mjs` (new) | The performance harness that produced §6. |
| `src/features/places/query-state.ts` | `view=map\|globe`, additive and defensive. |
| `src/features/places/components/places-explorer.tsx` | Segmented control, WebGL fallback, reduced motion, history. |
| `src/app/places/page.tsx`, `src/app/globals.css` | Texture props; globe, segmented-control and notice styles. |

No new endpoint, no Prisma migration, no schema change, no API contract change, no
change to Places eligibility, and **Leaflet is untouched**.

## 2. Dependencies

| Package | Version | Licence | Why |
| --- | --- | --- | --- |
| `react-globe.gl` | **2.38.0** (exact) | MIT | Decision D1 |
| `three` | **0.185.1** (exact) | MIT | Engine underneath |
| `globe.gl`, `three-globe`, `react-kapsule` | transitive, pinned by lockfile | MIT | Pulled by the above |

Both direct dependencies are pinned exactly (`--save-exact`), so a globe upgrade is
always a reviewed change. They reach the browser **only** through the lazy 3D chunk.

`npm audit` reports 3 pre-existing high findings in `next`, `sharp` and `postcss`.
They exist on `develop` and are unrelated to this change; fixing them would touch
dependencies outside this phase's scope.

## 3. Texture — source, licence, attribution

**Natural Earth 1:110m Admin 0 – Countries**, explicitly **public domain**
("No permission is needed to use Natural Earth"). Full record, including the quoted
terms of use, in **`public/places/ATTRIBUTION.md`**.

The PNG is **generated, never downloaded**:

```bash
npm run places:generate-earth-texture
# 177 countries → 2048×1024 indexed PNG → 36.5 KiB
```

The GeoJSON input is read from `three-globe/example/country-polygons/`, so it is
pinned by `package-lock.json` and the output is reproducible. The globe view shows
*« Fond de carte : Natural Earth (domaine public) »*. No provider, no API key, no
account, no recurring cost — decision D3 and NFR-I-05 satisfied.

## 4. Decisions honoured

| # | Implementation |
| --- | --- |
| D1 | `react-globe.gl` 2.38.0 / `three` 0.185.1, confined to `places-globe.tsx`, lazy. Leaflet still renders `view=map`. |
| D2 | Concept 2 sober + restrained Concept 1: dark globe, light atmospheric halo, luminous points, smooth centring. Segmented `2D \| 3D` beside **Filtres**. No animated arcs. **No auto-rotation at all** — a permanently animating canvas is what D2 excludes, and it costs frames for no information. |
| D3 | Static local texture, licence documented, attribution displayed. |
| D4 | `view=map\|globe` additive; absent ⇒ `map`; 2D default; engine not loaded in 2D; filters/search/`placeId`/list/statistics/detail shared; independent cameras; camera never in the URL; the active view centres on the selection in both directions; historical URLs unchanged. |
| D5 | Full 3D on capable mobiles, touch controls, WebGL probed before the chunk is requested, clean fallback with a message, `prefers-reduced-motion` respected. |
| D6 | Measured in §6. |

## 5. Rendering honesty (FR-I-10)

- `EXACT` — brightest point, tallest, largest radius;
- `PROBABLE` — visibly different colour, lower and smaller;
- `APPROXIMATE` — a **geodesic area** whose radius comes from
  `approximationRadiusMeters`, never a point, and never widened into an exact pin;
- a stored radius on an `EXACT` or `PROBABLE` place is ignored — asserted by test;
- `UNKNOWN` creates no `Place`, so it cannot appear;
- `REJECTED` is excluded from the globe exactly as from the 2D map — asserted by
  unit and component tests.

## 5.1 Review fix — the engine is gated on a *proven* capability

The first review found a real defect and it is fixed. The shell derived
`effectiveView` as `view === "globe" && globeAvailable === false ? "map" : view`.
When the probe had not answered yet, `globeAvailable` was `null`, the condition was
false, and the view stayed `globe` — so `PlacesRenderer` rendered the dynamic globe
and `next/dynamic` requested the 1.86 MiB chunk **before** the capability was known.
On a device without WebGL, opening `?view=globe` downloaded the engine and then
fell back. That violated FR-I-12, and the previous PR description claimed the
opposite.

The view is now resolved into three explicit states, and the globe branch is
reachable **only** on a proven `true`:

| Requested | Probe | Renders | URL |
| --- | --- | --- | --- |
| `map` | not consulted | 2D map | unchanged |
| `globe` | `unknown` | light waiting state, **no 3D reference at all** | keeps `view=globe` — nothing is known yet, so a legitimate deep link is not downgraded |
| `globe` | `supported` | globe | keeps `view=globe` |
| `globe` | `unsupported` / `failed` | 2D map + message | rewritten to 2D |

Only a **proven refusal** rewrites the URL. Filters, search, selection, list,
statistics and the detail sheet are preserved in every state.

The proof is direct rather than visual: `tests/unit/places-globe-lazy-load.test.tsx`
mocks the globe module with a factory that records whether it was ever evaluated,
which answers "was the dynamic import invoked?" — not "is a canvas visible?". It
covers the four states the review asked for (2D view, `unknown`, `unsupported`,
`failed`) and **fails against the previous implementation**, verified by
re-introducing the old expression before finalizing.

A second, smaller defect surfaced while re-running the browser suite:
`onGlobeReady` fires while globe.gl is still committing, so `setReady(true)` warned
that React state was being updated before the component had mounted. The update is
now deferred by a microtask.

## 6. Measurements — real values, not estimates

### 6.1 Bundle (NFR-I-01)

Measured from the Turbopack manifests of two production builds: `develop` `3fef818`
and this branch.

| | develop `3fef818` | Phase I | Δ |
| --- | --- | --- | --- |
| `/places` **initial** client JS | 392.0 KiB | 396.3 KiB | **+4.2 KiB (+1.08 %)** |
| `/places` lazy chunks | 3.1 KiB (Leaflet) | 1867.4 KiB | +1864.2 KiB |
| 3D chunk present in the initial load | — | **no** | — |
| Texture | — | 36.5 KiB | on demand |

The +4.2 KiB is the segmented control, the capability hooks and the renderer seam.
The 1.86 MiB engine is in a separate chunk that a 2D-only session never requests —
verified by the loadable manifest and by an e2e test that asserts the globe canvas
is absent at `view=map`. **No significant regression of the 2D bundle.**

### 6.2 Runtime

Harness: `scripts/places/measure-globe.mjs`, production build, local PostgreSQL
seeded with synthetic places, Chromium. Frame rate sampled **while dragging**, not
on a static globe.

| Profile | Places | First globe render | fps (before opt.) | fps (after opt.) |
| --- | --- | --- | --- | --- |
| desktop 1440×900 | 100 | 967 ms | 20 | 20 |
| desktop 1440×900 | 500 | 952 ms | 19 | 20 |
| desktop 1440×900 | 1000 | **907 ms** | 20 | 20 |
| mobile Pixel 7 | 100 | 978 ms | 12 | **18** |
| mobile Pixel 7 | 500 | 1033 ms | 12 | **18** |
| mobile Pixel 7 | 1000 | **990 ms** | 12 | **18** |

**Against the D6 budgets:**

| Budget | Target | Measured | Verdict |
| --- | --- | --- | --- |
| First globe render | < 3 s | 907–1033 ms | ✅ **met**, at every count |
| ~1000 places supported | yes | yes, no degradation from 100 → 1000 | ✅ **met** |
| 2D bundle regression | none significant | +1.08 % | ✅ **met** |
| Desktop frame rate | 50–60 fps | **20 fps** | ❌ **not met in this environment** |
| Mobile frame rate | ≥ 30 fps | **18 fps** | ❌ **not met in this environment** |

### 6.3 Why the frame-rate budgets could not be validated here

The CI container has **no GPU**. Chromium reports
`ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)` —
a pure CPU software rasterizer.

Two measurements identify the bottleneck, rather than assuming it:

1. **Frame rate is flat across scene size.** 100, 500 and 1000 places all give
   19–20 fps on desktop. If our scene were the cost, it would fall with the count.
2. **Frame rate tracks pixel count almost exactly.** At a fixed 1000 places:

   | Canvas | Pixels | fps |
   | --- | --- | --- |
   | 360×225 @1× | 0.08 Mpx | 60 |
   | 720×450 @1× | 0.32 Mpx | 45 |
   | 720×450 @2× | 1.30 Mpx | 26 |
   | 1440×900 @1× | 1.30 Mpx | 22 |

   Frame rate is governed by pixels rasterized, not by places drawn: the workload
   is fill-rate bound on a CPU rasterizer.

**The optimization applied and re-measured.** The renderer's pixel ratio is now
capped at 1.5 (`MAX_PIXEL_RATIO` in `places-globe.tsx`). A phone at
`devicePixelRatio` 3 was rasterizing nine times the pixels of a logical one, for no
visible gain on a smooth sphere. Measured effect: **mobile 12 → 18 fps (+50 %)**;
desktop unchanged, which is expected and confirms the diagnosis — desktop already
ran at ratio 1, so the cap does not apply there. This is a real improvement on real
high-DPI phones, not a CI artefact.

**What remains open.** The residual gap is the absent GPU. On any device with
hardware acceleration the same scene is rasterized by the GPU and the fill-rate wall
measured here does not apply — but that is a reasoned expectation, **not a
measurement**, and this record does not present it as one. The D6 frame-rate budgets
therefore remain **unvalidated** and require one run on real hardware:

```bash
npm run build && npm run start
DATABASE_URL=<local> node scripts/places/measure-globe.mjs --url http://127.0.0.1:3000
```

**Status: `FPS_BUDGET_PENDING_REAL_GPU_VALIDATION`.** The SwiftShader numbers above
are kept as measured, no GPU value is invented, and the reproduction command is
given. **This needs an owner decision** (see §9): accept the phase with the
frame-rate budgets pending a run on a GPU device, or hold it until that run is
done.

## 7. Tests — risk-based, consolidated after review

The first round shipped 76 unit, 10 component and 13 e2e scenarios run on two
projects: disproportionate for this application, and expensive in maintenance, in
verification time and in the context every future agent has to read. The second
round consolidated them against the rule now recorded in `AGENTS.md` §10 — cover
risks, parameterize variants, do not replay a unit-proven rule at three levels.

| Level | Before | After | Change |
| --- | --- | --- | --- |
| Unit (Phase I) | 76 | **18** | −76 % |
| Component | 10 | **8** | −20 % |
| e2e scenarios | 13 | **7** | −46 % |
| e2e **executions** (× projects) | 26 | **7** | −73 % |
| Whole repository, unit | 526 | 466 | — |
| Whole repository, e2e executed | 111 | 92 | — |
| Unit suite duration | 15.3 s | **11.9 s** | −22 % |
| e2e suite duration | ~84 s | **56.6 s** | −33 % |

Nothing on the review's must-keep list was dropped. Coverage removed was
duplication: per-value cases folded into table-driven tests, and assertions that a
unit test already proved being replayed at component or e2e level.

### 7.1 Why each new test file exists (`AGENTS.md` §10)

| File | Risk it covers |
| --- | --- |
| `tests/unit/places-globe-projection.test.ts` (12) | The pure scene maths. A wrong sign, a mishandled antimeridian or a naive longitude average silently produces a globe that puts places in the wrong hemisphere — invisible in review, invisible in a screenshot. Also locks the honest-precision rules: `APPROXIMATE` is an area, a stale radius never widens an `EXACT` place, `REJECTED` never renders. |
| `tests/unit/places-webgl.test.ts` (3) | The probe decides whether 1.86 MiB is downloaded. It must answer honestly in each branch and never throw, including when a hardened browser blocks `getContext`. |
| `tests/unit/places-globe-lazy-load.test.tsx` (4) | The FR-I-12 regression this review caught. Observes the *import*, not the pixels, across the four capability states. Fails against the previous implementation. |
| `tests/unit/places-view-switch.test.tsx` (4) | The shared-state contract across a view switch — filters, search, selection, URL, history, fallback, reduced motion — which no unit test can prove because it is the composition that matters. |
| `tests/e2e/places-globe.spec.ts` (7) | The four things only a real browser proves: real routing and history, a real lazy chunk request, a real WebGL context and its refusal, and real layout. Six run on desktop; one mobile journey runs on the mobile project, because only the viewport genuinely differs. |

The `view` contract is covered by 3 tests added to the existing
`tests/unit/places-query-state.test.ts` rather than a new file.

The 3D engine is **mocked in every automated test**. No test makes a network call
to Geoapify, a texture CDN or any 3D provider — asserted, not assumed.

## 8. Verification (all fresh)

```
npm run db:generate ... OK
npm run lint ........... OK — 0 warning (--max-warnings=0)
npm run typecheck ...... OK
npm run test ........... 54 files, 466 tests passed, 0 failed  (440 on develop, +26)
npm run build .......... OK
npm run test:e2e ....... 92 passed, 20 skipped (chromium + mobile)
```

The whole Phase G e2e suite passes **unmodified** (FR-I-02).

## 9. Risks, limits and open points

- **`FPS_BUDGET_PENDING_REAL_GPU_VALIDATION`** — see §6.3. Requires one run on a GPU
  device. **Owner decision needed.** The SwiftShader measurements stand as recorded
  and no GPU figure is invented.
- The atmospheric halo and the globe texture are the fill-rate cost centre; if a
  real device also misses the budget, the next measured levers are disabling
  antialiasing and lowering `atmosphereAltitude`. Neither was applied here, because
  trading visible quality against a number produced by a software rasterizer would
  be optimizing for the wrong target.
- Aggregation thresholds (`CONTINENT_ALTITUDE_MIN`, `COUNTRY_ALTITUDE_MIN`,
  `AGGREGATION_MIN_PLACES`) are reasoned defaults tested for behaviour, not tuned
  against a real corpus; they are constants in one pure module.
- The globe canvas is a pointer surface. The list drawer remains the complete
  keyboard path to every place, and the globe never traps focus.
- `npm audit`: 3 pre-existing high findings inherited from `develop` (§2).

## 10. Out of scope, untouched

Phase E, H and J; worker; Hermes; MCP; Redis; OCR; transcription; multimodal
analysis; Prisma migration; new endpoint; external API writes; bbox querying; map
pagination; 3D provider key; paid service; Leaflet replacement; Phase G redesign.
