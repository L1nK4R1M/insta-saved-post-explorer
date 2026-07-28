# Places mobile usability Verification Report

**Date:** 2026-07-28
**Revision:** `codex/places-mobile-navigation-radius` working tree based on `44b0da0`

## Evidence

| Claim | Command or observation | Result | Evidence summary |
| --- | --- | --- | --- |
| Linked posts load publicly and writes remain guarded | focused Vitest | Pass | 29/29 across actions, scoring and view switch |
| Mobile switch is not clipped | mobile Playwright | Pass | switch rectangle inside stage and viewport |
| Return navigation works | desktop Places Playwright | Pass | 6/6 including labelled `/` link |
| Repository remains healthy | lint, typecheck, full Vitest, build | Pass | 360 passed / 130 skipped; 32-page build |

## Baseline and RED proof

- Candidate JSONL read-only count: 407 records, 646 candidates.
- First focused run: 4 expected failures (public read still `FORBIDDEN`; city and
  postcode still 25,000 m).

## GREEN proof

| Command or seam | Result |
| --- | --- |
| Focused Vitest (actions, scoring, view switch) | 29 passed |
| Places desktop Playwright | 6 passed |
| Places mobile Playwright | 1 passed; switch bounds inside stage and viewport |
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm run test` | 360 passed, 130 environment-bound skipped |
| `npm run build` | PASS; 32 pages generated |
| `git diff --check` | PASS |

The mobile globe run emitted the existing readiness microtask React warning at
`places-globe.tsx:177`; the scenario passed and the warning's code is outside
this diff.

## Original scenario

The original unauthenticated Places detail read returned `FORBIDDEN`, the mobile
toolbar kept every control in one clipped row, no explicit return link existed,
and city-like scoring returned 25,000 metres. The focused RED run observed these
exact failures before implementation.

## Traceability status

Verified. Every `REQ-001` through `REQ-006` maps to a passing test or read-only
count observation in `09-traceability.md`.

## Unverified areas and limitations

- PostgreSQL integration suites remain skipped without `TEST_DATABASE_URL`;
  their 10 km expectation is updated but was not executed against a test DB.
- The branch is not deployed, so no live Production UI claim is made.

## Residual risks

- Existing Production rows still store 25 km and will continue to display that
  honest value until a separately authorized data correction.

## Boundaries

- No dependency or Prisma migration changed.
- No production database row changed.
- No commit, push, PR or deployment was performed.
- Existing approximate rows remain at their persisted radius.
