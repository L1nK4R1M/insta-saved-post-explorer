# Phase I — Places 3D globe — implementation plan

**Decisions approved — implementation is unblocked.** The owner closed every open
decision on 25 July 2026 and `docs/adr/ADR-places-3d-engine.md` is **ACCEPTED**
(engine `react-globe.gl`/`globe.gl`, Concept 2 sober with restrained Concept 1
elements, static free texture, `view=map|globe` with 2D default and independent
cameras, full mobile 3D with a WebGL fallback, and the measurable budgets in D6).

**T0 is satisfied by the design PR.** **T1 → T10 are implemented** on
`claude/phase-i-places-3d-implementation` and awaiting review; the delivered
architecture, dependency versions, texture licence, test inventory and every measured
value are recorded in `docs/changes/2026-07-25-phase-i-places-3d-implementation.md`.

One item from T9 is **not** closed: the D6 frame-rate budgets could not be validated
because the CI container has no GPU. The measurement, its diagnosis and the applied
optimization are recorded; the remaining decision belongs to the owner.

Requirements referenced here are defined in `docs/phase-i-places-3d-brief.md` §2.
The task order below is the dependency order: each task is independently
verifiable and leaves the repository green.

---

## 1. Ordered tasks

### T0 — Record the owner's decisions *(documentation only)* — ✅ **DONE**
ADR moved to `ACCEPTED` with `react-globe.gl`/`globe.gl`, Concept 2 (+ restrained
Concept 1 elements), the static free texture policy, the `view` contract, the mobile
and fallback rules and the D6 budgets. **Gate closed** — T1 may start.
Touched: `docs/adr/ADR-places-3d-engine.md`, `docs/phase-i-places-3d-brief.md`,
`docs/superpowers/plans/2026-07-25-phase-i-places-3d.md`, status documents.

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
Add `react-globe.gl` (with `three`) as a dependency. Lazy `next/dynamic` +
`ssr:false`; dark premium globe with a light atmospheric halo; luminous points for
`EXACT`/`PROBABLE` with a **clear visual difference** between them; halo/zone
proportional to `approximationRadiusMeters` for `APPROXIMATE`; `UNKNOWN` and
`REJECTED` never rendered; selection highlight and smooth centring
(`pointOfView`); `onSelect`/`onHover` upward. Ship the static Earth texture as a
local asset and **document its licence, source and attribution** — an unclear
licence must not be committed. Engine-specific code confined to this file.
Covers FR-I-01, FR-I-06, FR-I-10, FR-I-15, NFR-I-01, NFR-I-04, NFR-I-08.
Tests: integration with the engine mocked (props → expected scene calls).

### T6 — View toggle and shared state
Segmented `2D | 3D` control **next to the filters** (Concept 2). Selection, filters,
search, list, statistics and the detail panel survive the switch; independent
cameras (v1) re-framed from the shared selection: 2D → 3D centres the globe on the
selected place, 3D → 2D centres Leaflet on it.
Covers FR-I-03, FR-I-04, FR-I-05, FR-I-06, FR-I-08.
Tests: unit (state preserved across switch); e2e (toggle both ways, filter then switch, deep link).

### T7 — Reduced motion, keyboard and mobile
No auto-rotation and instant camera moves under `prefers-reduced-motion`; the globe
never traps focus; selection reachable from the list; mobile behaviour per decision D5.
Covers FR-I-13, FR-I-14, FR-I-16.
Tests: e2e with the media feature emulated; keyboard path; mobile viewport project.

### T8 — Aggregation by continent/country
Visual clustering when several places are close at world scale, with country/
continent aggregation; zooming in resolves to individual places. Concept 2 keeps the
existing chrome — no breadcrumb navigation (that belonged to the rejected Concept 3).
Covers FR-I-11.
Tests: unit on aggregation; e2e drill-down.

### T9 — Performance and bundle evidence
Measure with ~1000 synthetic places against the **D6 budgets**: 50–60 fps recent
desktop, ≥ 30 fps capable mobile, first globe render < 3 s, and no significant
regression of the initial `/places` bundle in 2D. Produce a bundle report proving
the 3D chunk is absent from the 2D entry.
Covers NFR-I-01, NFR-I-02, NFR-I-03.
Tests: performance probe; bundle report attached to the PR.
**The real measured values must be recorded in the final proof — budgets are
measurable, not decorative.**

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
| FR-I-15 attribution | Attribution of the static texture, documented (D3) | T5 | e2e visible attribution | Attribution rendered in globe view; licence recorded in docs |
| FR-I-16 mobile | Full 3D on capable devices, loaded on demand, touch controls (D5) | T7 | e2e mobile project | Globe usable on mobile; loaded only after explicit selection |
| NFR-I-01 no 3D for 2D users | Lazy dynamic import | T5, T9 | Bundle report | 3D chunk absent from the 2D entry |
| NFR-I-02 fluidity | Points, no per-marker DOM | T9 | Performance probe (~1000) | 50–60 fps desktop, ≥ 30 fps mobile — measured values recorded |
| NFR-I-03 time to globe | Lazy chunk + skeleton | T9 | Measurement | First globe render < 3 s — measured value recorded |
| NFR-I-04 one source of truth | Reuses `loadPlacesMapView` | T5 | Code review + integration | No new endpoint, no Prisma in components |
| NFR-I-05 no cost | Static free texture; no paid provider (D3) | T0, T5 | ADR accepted + licence documented | ADR ACCEPTED; texture licence/source/attribution recorded |
| NFR-I-06 reversibility | Globe is a leaf component | T3, T5 | Removal rehearsal in review | 2D intact without the globe |
| NFR-I-07 no regression | Additive only | T10 | lint/typecheck/test/build/e2e | All green, no migration |
| NFR-I-08 maintainability | Engine confined to one component + pure module | T2, T5 | Code review | No engine import outside the globe |

---

## 3. Risks carried into implementation

- Hover callout re-anchoring (audit gap G2) — the globe must project screen coordinates.
- Texture licensing: only a clearly free, repository-compatible, lightweight texture may be committed, with its licence and attribution documented (D3). If no suitable texture is found, stop and report rather than committing an unclear one.
- Measured performance may miss the D6 budgets on mobile; if so, report the measurement instead of relaxing the budget silently.
- Concept 2 keeps the reduced-motion path cheap (no auto-rotation, instant camera), but the borrowed Concept 1 halo must stay static.

## 4. Definition of done

All requirements in §2 proven by their listed test, `lint`/`typecheck`/`test`/
`build`/`test:e2e` green, no Prisma migration, no API contract change, bundle
evidence attached, documentation updated, and the Phase G 2D experience unchanged.
