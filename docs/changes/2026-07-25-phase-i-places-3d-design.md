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

Phase I stays **`AWAITING_OWNER_DECISION`**. It is deliberately not `IN_PROGRESS`.

## What was produced

| File | Content |
| --- | --- |
| `docs/phase-i-places-3d-brief.md` (new) | Brownfield audit of Phase G, contracts to preserve, six identified gaps, FR/NFR with stable IDs and measurable criteria, acceptance criteria, target architecture, three UX concepts with wireframes, test strategy, scope |
| `docs/adr/ADR-places-3d-engine.md` (new) | **PROPOSED** ADR: context, ten constraints, four options (Three.js, Three.js via globe.gl, CesiumJS, MapLibre globe), weighted decision table, costs, risks, reversibility, recommendation, consequences, open decisions, re-evaluation triggers |
| `docs/superpowers/plans/2026-07-25-phase-i-places-3d.md` (new) | Eleven ordered tasks (T0–T10) and the requirement → architecture → task → test → proof matrix |
| `docs/changes/2026-07-25-phase-i-places-3d-design.md` (new) | This record |
| `docs/HANDOFF.md` | Phase I set to `AWAITING_OWNER_DECISION`; next action points at the decision list |
| `docs/IMPLEMENTATION_STATUS.md` | Phase I row updated; the new status value documented in the legend |
| `docs/CODEX_IMPLEMENTATION_ORDER.md` | Phase I section points at the brief and the ADR |

## Audit findings that shaped the architecture

1. `PlacesMapItem` already carries everything a globe needs — **no new server field, no new endpoint, no migration**.
2. **The URL has no `view` parameter** — it must be added additively so every existing link keeps working.
3. The hover callout is anchored on 2D container pixels; the globe must project its own screen coordinates.
4. `tileUrl`/`tileAttribution` are raster-specific and must not leak into the shared renderer contract.
5. `PlacesExplorer` renders Leaflet directly — a small renderer seam is needed so both views share list, filters and detail.
6. There is no WebGL probe and reduced motion is honoured only in the 2D map.

## Recommendation (not a decision)

**Three.js via `globe.gl` / `react-globe.gl`** — the only option satisfying every
hard constraint simultaneously: Leaflet untouched, zero recurring cost, no new
provider account, premium globe with little custom code, lazy-loaded so 2D users
pay nothing, fully reversible. Cesium remains correct **only** if terrain or 3D
buildings become a requirement; MapLibre **only** if the owner decides to unify 2D
and 3D on one engine — which would reopen the Phase G stack decision.

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

The owner decides ADR §10 (engine, visual concept, basemap/terrain source, budget,
2D ↔ 3D behaviour, mobile). Implementation may start only after T0 records those
decisions.
