# Change record — Phase I: Places 3D globe, design and preparation

- Date: 25 July 2026
- Branch: `claude/phase-i-places-3d-design` (from `develop` `8d5c1ee`)
- Phase G reference: PR #34, squash `2bd2098`
- VibeSpec route: **Critical** — the phase introduces a new rendering engine and a
  possible external provider. This PR is the discovery/design stage of that route:
  **documentation only, no production code.**

## Intent

Produce the complete Phase I preparation pack — brownfield audit, engine
comparison, recommendation, UX concepts, target architecture, ADR, requirements,
acceptance criteria, ordered tasks, traceability matrix and test strategy — so the
owner can decide before any 3D code exists.

The owner reviewed the pack and **approved every open decision on 25 July 2026**;
the ADR is now **ACCEPTED**. Phase I moves to **`DESIGN_APPROVED`** — the design gate
is closed and implementation may start **in a separate PR**. Phase I is deliberately
**not** `IN_PROGRESS` and **not** `COMPLETE`: no production code exists yet.

## What was produced

| File | Content |
| --- | --- |
| `docs/phase-i-places-3d-brief.md` (new) | Brownfield audit of Phase G, contracts to preserve, six identified gaps, FR/NFR with stable IDs and measurable criteria, acceptance criteria, target architecture, three UX concepts with wireframes, test strategy, scope |
| `docs/adr/ADR-places-3d-engine.md` (new) | **ACCEPTED** ADR (decision: `react-globe.gl`/`globe.gl`): context, ten constraints, four options (Three.js, Three.js via globe.gl, CesiumJS, MapLibre globe), weighted decision table, costs, risks, reversibility, recommendation, consequences, the six closed decisions (D1–D6), re-evaluation triggers |
| `docs/superpowers/plans/2026-07-25-phase-i-places-3d.md` (new) | Eleven ordered tasks (T0–T10) and the requirement → architecture → task → test → proof matrix |
| `docs/changes/2026-07-25-phase-i-places-3d-design.md` (new) | This record |
| `docs/HANDOFF.md` | Phase I set to `DESIGN_APPROVED`; approved decisions recorded; next action is implementation T1–T10 |
| `docs/IMPLEMENTATION_STATUS.md` | Phase I row set to `DESIGN_APPROVED`; status values documented in the legend |
| `docs/CODEX_IMPLEMENTATION_ORDER.md` | Phase I section points at the brief and the ADR |

## Audit findings that shaped the architecture

1. `PlacesMapItem` already carries everything a globe needs — **no new server field, no new endpoint, no migration**.
2. **The URL has no `view` parameter** — it must be added additively so every existing link keeps working.
3. The hover callout is anchored on 2D container pixels; the globe must project its own screen coordinates.
4. `tileUrl`/`tileAttribution` are raster-specific and must not leak into the shared renderer contract.
5. `PlacesExplorer` renders Leaflet directly — a small renderer seam is needed so both views share list, filters and detail.
6. There is no WebGL probe and reduced motion is honoured only in the 2D map.

## Decision (approved by the owner, 25 July 2026)

**Three.js via `react-globe.gl` / `globe.gl`** — the recommendation was accepted.
Raw Three.js, CesiumJS and MapLibre-for-3D are rejected for v1; **Leaflet is not
replaced** and the 2D view is not migrated. Cesium would only become correct if
terrain or 3D buildings became a requirement; MapLibre only if the owner later
decided to unify 2D and 3D on one engine, which would reopen the Phase G stack
decision (recorded as re-evaluation triggers in ADR §11).

The five remaining decisions were closed at the same time — visual concept
(**Concept 2 sober**, enriched with restrained Concept 1 elements), **static free
texture** with documented licence and no paid provider, `view=map|globe` with 2D as
the default and independent cameras in v1, **full mobile 3D** with a WebGL fallback,
and the **measurable D6 performance budgets** (50–60 fps desktop, ≥ 30 fps mobile,
first globe render < 3 s, no significant 2D bundle regression). Full detail in
ADR §10.

Package facts (versions, licences, weights) were read from the npm registry on
25 July 2026. `unpackedSize` is repository weight, **not** bundle size; the real
runtime cost must be measured during implementation (task T9).

## Verification

Documentation-only change: `npm run lint`, `npm run typecheck`, `npm run test`,
`npm run build` were run to prove no regression. The ADR's weighted table
arithmetic was recomputed and corrected to the verified totals.

No production code, no dependency added, no Prisma migration, no API change, no
Neon change, no secret.

## Next action

T0 is **done** — the decisions are recorded. Implementation starts at **T1** in a
dedicated branch off the latest `develop`, following
`docs/superpowers/plans/2026-07-25-phase-i-places-3d.md`. The real performance
measurements required by D6 must be recorded in that PR's final proof.
