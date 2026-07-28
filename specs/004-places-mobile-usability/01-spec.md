# Places mobile usability - Specification

**Mode:** critical
**Status:** approved
**Owner:** repository owner

## Problem

On small screens the 2D/3D control can be clipped, Places has no explicit exit,
and visitors who can view the public Places map cannot load its associated post
thumbnails. City-level approximate results also use a 25 km radius instead of
the requested 10 km.

## Functional requirements

- `REQ-001`: At supported mobile widths the complete 2D/3D segmented control
  remains inside the visible Places stage.
- `REQ-002`: `/places` exposes an explicit link back to the post library.
- `REQ-003`: A selected public place loads its linked post summaries through
  the configured owner scope without requiring an administrator session.
- `REQ-004`: Confirm and reject actions remain administrator-only.
- `REQ-005`: City, town, village, municipality, locality and postcode provider
  results use a 10,000 metre approximate radius for new scoring results.
- `REQ-006`: The operator-facing explanation distinguishes 407 post records
  from 646 candidate locations.
- `REQ-007`: Production deployment occurs only after GitHub checks and a READY
  Preview, and is followed by health, route, browser and runtime-error checks.
- `REQ-008`: Exactly the existing 25,000 metre approximate rows are corrected
  to 10,000 metres after a point-in-time Neon branch backup.

## Non-functional requirements

- `NFR-001`: No horizontal page overflow and no control clipping at the mobile
  Playwright viewport.
- `NFR-002`: No schema migration or dependency is introduced; the only
  Production mutation is the reviewed bounded radius correction.
- `NFR-003`: Rollback retains the previous Vercel deployment and a named Neon
  branch created immediately before the data update.

## Invariants and compatibility

- `INV-001`: Place reads remain restricted to `getConfiguredOwnerId()`.
- `INV-002`: Review writes remain admin-authenticated.
- `INV-003`: Eligibility remains exactly canonical Voyages or Restaurant.
- `INV-004`: Exact, probable, district, county, state and unknown semantics are
  unchanged.

## Acceptance criteria

- `AC-001`: A mobile browser proves the segmented control's bounding rectangle
  is fully inside the stage and viewport.
- `AC-002`: The back link is visible and navigates to `/`.
- `AC-003`: The read action calls `getPlacePosts` with the configured owner even
  when `getSession()` would return null; mutation tests still refuse non-admins.
- `AC-004`: Focused scoring tests return 10,000 metres for all city-like result
  types.
- `AC-005`: GitHub/Vercel report the merged commit as READY in Production and
  `/api/health` plus `/places` return successful responses.
- `AC-006`: Neon reports zero remaining 25,000 metre approximate rows, 29 rows at
  10,000 metres, and unchanged total place/link/evidence/job aggregates.

## Out of scope

- Reinterpreting the 646 candidates as posts; changing theme eligibility;
  importing more records; changing API authentication; updating existing
  production rows outside the exact 25,000 metre approximate predicate; any
  worker, Phase H, MCP, Hermes or unrelated deployment.
