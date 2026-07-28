# Change record - Places mobile usability and linked posts

## Scope

Correct four observed Places regressions without changing the schema, provider,
eligibility rule, public API or worker:

- keep the 2D/3D control fully visible on mobile;
- add an explicit return link to the post library;
- allow the public Places detail sheet to load configured-owner post summaries;
- use 10 km instead of 25 km for newly scored city-like approximate results.

## Count clarification

The supplied candidate JSONL was counted locally without modifying it:

```text
post records:     407
place candidates: 646
```

The candidate count is not a post count. One of the 407 eligible posts may have
several candidate locations. The recorded production result remains 254 distinct
posts linked to 51 canonical places; unresolved candidates do not become places.

## Implementation

| Area | Change |
| --- | --- |
| Navigation | `/places` links deterministically back to `/`. |
| Mobile | Search occupies the first row; filters and 2D/3D share a second row. |
| Linked posts | The read action uses only `getConfiguredOwnerId()`; no owner is accepted from the browser. |
| Review | Confirm/reject remain protected by the existing admin session check. |
| Approximation | City-like provider types now score with a 10,000 metre radius. |

## Production-data boundary

Production preflight finds 29 `APPROXIMATE` rows at 25 km. The repository owner
authorized deployment and their bounded correction on 28 July 2026. The rollout
must retain the previous Vercel deployment and create a named Neon backup branch
before the transaction. Final evidence is recorded only after those operations.

## Verification

- focused Vitest: 29 passed;
- desktop Places Playwright: 6 passed;
- mobile Places globe Playwright: 1 passed, including exact switch bounds;
- lint: PASS;
- typecheck: PASS;
- full Vitest: 360 passed, 130 environment-bound skipped;
- production build: PASS, 32 pages;
- `git diff --check`: PASS.

The mobile globe test still emits the pre-existing React readiness warning from
`places-globe.tsx`; it passes and this change does not modify that lifecycle.
