# Places mobile usability - Production Release

Release gate: READY

## Change summary

Production now contains the mobile toolbar and navigation repairs, public
configured-owner linked-post loading and 10 km city-like scoring. Exactly 29
legacy city-level radius records were corrected separately and transactionally.

## Prerequisites

Local focused tests, lint, typecheck, full tests, build and Places E2E passed.
GitHub CI #149 and Preview deployment `dpl_DVqQRqCUrP9bXWmjobL5SKoPNi18`
passed before merge. The Neon preflight confirmed exactly 29 eligible rows.

## Validation after release

Production `/api/health` and `/places` returned HTTP 200. Health identified
version `8dbfd46` and a connected database. A 390 x 844 Chromium run proved the
complete switch, return link and one linked post with zero sheet errors. Vercel
reported no `/places` or `/api/health` runtime error in the initial window.

## Migration plan

No schema migration exists. The only data transition was a single guarded Neon
transaction updating approximate 25,000 metre radii to 10,000 metres, with an
exception and rollback unless exactly 29 rows were affected.

## Rollout plan

PR #49 was squash-merged as `8dbfd46b6e1b0ccbd8d20a31007de3814ca2758e`.
Vercel Production deployment `dpl_HHKuBeSYf5L9izLHqCfMsyxmCNMh` reached READY.
After health verification, the backup was created and the guarded transaction
and all post-release checks completed successfully.

## Rollback plan

For a code regression, restore preceding Vercel deployment
`dpl_2GFsngT1j5DtoypxtnGFpobUu4Po`. For a data-only reversal, read the 29 IDs
from backup `br-curly-firefly-asy8hqti` and restore only those IDs to 25,000
metres transactionally after reconciling any later writes.

## Observability and alerts

Signals are GitHub checks, Vercel state/build logs, `/api/health`, `/places`,
mobile browser interaction, grouped runtime errors and Neon distributions plus
relationship aggregates. Any unhealthy signal triggers rollback assessment.

## Incident readiness

The previous Vercel deployment and the named Neon point-in-time branch remain
available. Deployment, commit, project, branch, counts and predicates are
recorded here so an operator can execute a scoped recovery without guessing.

## Execution evidence

- Production before and after aggregates: 51 places, 301 links, 254 distinct
  linked posts, 1,203 evidence rows and 407 jobs.
- Radius distribution after correction: 0 at 25,000 m, 29 at 10,000 m and 10 at
  5,000 m; zero non-approximate radii and zero invalid approximate radii.
- Backup `backup-main-before-places-radius-2026-07-28`
  (`br-curly-firefly-asy8hqti`) retains the 29 pre-change 25,000 metre rows.
