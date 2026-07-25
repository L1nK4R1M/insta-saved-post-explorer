# Phase I — Places 3D globe — implementation plan

**Blocked on owner decisions** (`docs/adr/ADR-places-3d-engine.md` §10). Nothing in
this plan may start before the engine, the visual concept, the basemap/texture
source, the budget and the 2D ↔ 3D behaviour are chosen.

Requirements referenced here are defined in `docs/phase-i-places-3d-brief.md` §2.
The task order below is the dependency order: each task is independently
verifiable and leaves the repository green.

---

## 1. Ordered tasks

### T0 — Record the owner's decisions *(documentation only)*
Update the ADR to `ACCEPTED` with the chosen engine and concept; record the
basemap/texture source, the budget and the mobile decision. **Gate: no code before
T0 is merged.**
Touches: `docs/adr/ADR-places-3d-engine.md`, `docs/phase-i-places-3d-brief.md`.

### T1 — Additive `view` in the URL contract
Add `view: "map" | "globe"` to `PlacesUrlState`; absent or unknown ⇒ `map`. Serialize
only when `globe`. No renderer change yet.
Covers FR-I-01, FR-I-08, FR-I-09.
Touches: `src/features/places/query-state.ts`, `src/app/places/page.tsx`.
Tests: `tests/unit/places-query-state.test.ts` (parse, serialize, round-trip, unknown value, old URLs unchanged).

### T2 — Pure 3D view model
New `src/lib/places/globe-projection.ts`: `latLonToVec3`, `angularRadiusForMeters`,
`aggregateByCountry`, `aggregateByContinent`. Pure, no engine import.
Covers FR-I-10, FR-I-11, NFR-I-08.
Tests: new `tests/unit/places-globe-projection.test.ts` (poles, meridian, antimeridian, radius conversion, aggregation counts, `UNKNOWN`/`REJECTED` excluded).

### T3 — Renderer seam in the shell
Extract the renderer selection inside `PlacesExplorer` so the shell hosts either
renderer without duplicating list, filters, detail or summary. Leaflet still the
only renderer at this point — **pure refactor, behaviour identical**.
Covers FR-I-02, FR-I-04, FR-I-05, FR-I-06, FR-I-07, NFR-I-06.
Tests: existing Phase G unit + e2e suites must stay green unchanged.

### T4 — WebGL capability probe and fallback
`supportsWebGl()` helper + shell behaviour when unsupported: the globe is not
offered, an explicit message is shown, 2D/list/detail stay fully usable.
Covers FR-I-12.
Tests: unit (probe true/false); e2e with WebGL stubbed out.

### T5 — `PlacesGlobe3D` component *(first code touching the engine)*
Lazy `next/dynamic` + `ssr:false`; renders the filtered places; points for
`EXACT`/`PROBABLE`; area sized by `approximationRadiusMeters` for `APPROXIMATE`;
selection highlight; `onSelect`/`onHover` upward. Engine-specific code confined here.
Covers FR-I-01, FR-I-06, FR-I-10, FR-I-15, NFR-I-01, NFR-I-04, NFR-I-08.
Tests: integration with the engine mocked (props → expected scene calls).

### T6 — View toggle and shared state
Visible 2D ↔ 3D control per the chosen concept; selection, filters and search
survive the switch; independent cameras re-framed from the shared selection.
Covers FR-I-03, FR-I-04, FR-I-05, FR-I-06, FR-I-08.
Tests: unit (state preserved across switch); e2e (toggle both ways, filter then switch, deep link).

### T7 — Reduced motion, keyboard and mobile
No auto-rotation and instant camera moves under `prefers-reduced-motion`; the globe
never traps focus; selection reachable from the list; mobile behaviour per decision D5.
Covers FR-I-13, FR-I-14, FR-I-16.
Tests: e2e with the media feature emulated; keyboard path; mobile viewport project.

### T8 — Aggregation by continent/country
Country/continent aggregation rendered when zoomed out, drill-down to places.
For Concept 3, this is also the breadcrumb navigation.
Covers FR-I-11.
Tests: unit on aggregation; e2e drill-down.

### T9 — Performance and bundle evidence
Measure with ~1000 synthetic places; produce a bundle report proving the 3D chunk is
absent from the 2D entry.
Covers NFR-I-01, NFR-I-02, NFR-I-03.
Tests: performance probe; bundle report attached to the PR.

### T10 — Documentation and closure
Update `docs/places-ui.md` (a 3D section), `HANDOFF.md`, `IMPLEMENTATION_STATUS.md`,
and add a change record. Full validation suite.
Covers NFR-I-07.

---

## 2. Traceability matrix

Requirement → architecture decision → task → test → expected proof.

| Requirement | Architecture decision | Task | Test | Expected proof |
| --- | --- | --- | --- | --- |
| FR-I-01 globe reachable | `view` param + lazy `PlacesGlobe3D` | T1, T5 | e2e "renders the globe at `view=globe`" | Globe canvas present; 2D absent |
| FR-I-02 2D unchanged | Renderer seam, Leaflet untouched | T3 | Full Phase G e2e suite | Phase G suite green with no edits |
| FR-I-03 visible toggle | Segmented control in the shell | T6 | e2e toggle both directions | One interaction switches views |
| FR-I-04 shared filters | Shell owns `filters`; renderers receive filtered data | T3, T6 | unit + e2e filter-then-switch | Same filtered set in both views |
| FR-I-05 shared search | Shell owns `q` | T3, T6 | e2e search-then-switch | `q` preserved, same narrowing |
| FR-I-06 shared selection | Shell owns `selectedId` | T3, T5, T6 | unit + e2e select-then-switch | Selection kept; globe centres on it |
| FR-I-07 view-agnostic detail | `PlaceDetailSheet` outside renderers | T3 | e2e open detail from both views | Identical content and actions |
| FR-I-08 deep links | `view` serialized in URL | T1, T6 | e2e `?view=globe&placeId=…` + back/forward | View and selection restored |
| FR-I-09 old URLs work | `view` absent ⇒ `map` | T1 | unit + Phase G e2e | Phase G URLs render 2D identically |
| FR-I-10 honest precision | Pure projection module + render rules | T2, T5 | unit + integration | Area for APPROXIMATE; no UNKNOWN/REJECTED |
| FR-I-11 aggregation | `aggregateByCountry/Continent` | T2, T8 | unit + e2e drill-down | Counts match; drill-down reaches places |
| FR-I-12 no-WebGL fallback | `supportsWebGl()` probe | T4 | unit + e2e with WebGL stubbed | Globe not offered; 2D/list/detail usable |
| FR-I-13 reduced motion | `reducedMotion` prop | T7 | e2e with media emulated | No auto-rotation; instant camera |
| FR-I-14 keyboard | List as the non-pointer path | T7 | e2e keyboard | Selection without pointer; no focus trap |
| FR-I-15 attribution | Attribution from the chosen source | T5 | e2e visible attribution | Attribution rendered in globe view |
| FR-I-16 mobile | Decision D5 | T7 | e2e mobile project | Agreed behaviour on small screens |
| NFR-I-01 no 3D for 2D users | Lazy dynamic import | T5, T9 | Bundle report | 3D chunk absent from the 2D entry |
| NFR-I-02 fluidity | Points, no per-marker DOM | T9 | Performance probe (~1000) | ≥ 30 fps sustained |
| NFR-I-03 time to globe | Lazy chunk + skeleton | T9 | Measurement | < 2.5 s warm cache |
| NFR-I-04 one source of truth | Reuses `loadPlacesMapView` | T5 | Code review + integration | No new endpoint, no Prisma in components |
| NFR-I-05 no cost | No new provider without decision | T0 | ADR accepted | Recorded decision |
| NFR-I-06 reversibility | Globe is a leaf component | T3, T5 | Removal rehearsal in review | 2D intact without the globe |
| NFR-I-07 no regression | Additive only | T10 | lint/typecheck/test/build/e2e | All green, no migration |
| NFR-I-08 maintainability | Engine confined to one component + pure module | T2, T5 | Code review | No engine import outside the globe |

---

## 3. Risks carried into implementation

- Hover callout re-anchoring (audit gap G2) — the globe must project screen coordinates.
- The reduced-motion path removes most of Concept 1's identity; if Concept 1 is chosen, define its reduced-motion variant during T0.
- Concept 3 adds breadcrumb navigation state that may need its own URL semantics — specify it in T0, not during T8.

## 4. Definition of done

All requirements in §2 proven by their listed test, `lint`/`typecheck`/`test`/
`build`/`test:e2e` green, no Prisma migration, no API contract change, bundle
evidence attached, documentation updated, and the Phase G 2D experience unchanged.
