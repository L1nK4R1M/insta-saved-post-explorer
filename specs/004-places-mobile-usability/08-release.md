# Places mobile usability - Production Release

**Mode:** Critical
**Status:** Approved, pending execution
**Authorization:** Repository owner, 28 July 2026

## Preconditions

- Local focused tests, lint, typecheck, full tests and build pass.
- `origin/main`, GitHub Production and Vercel Production all identify `44b0da0`
  as the baseline.
- Neon Production is project `fancy-mud-69762258`, branch
  `br-super-snow-asyrmnbm` (`main`).
- Read-only preflight finds 29 approximate rows at 25,000 m, 10 at 5,000 m and
  12 exact places.

## Rollout

1. Commit and push the verified branch.
2. Open a PR to `main`; wait for required GitHub checks and READY Vercel Preview.
3. Merge with the expected reviewed head SHA.
4. Wait for the new `main` Production deployment to become READY.
5. Create Neon branch `backup-main-before-places-radius-2026-07-28` from `main`.
6. In one transaction, update only rows matching:
   `precision = 'APPROXIMATE' AND approximation_radius_meters = 25000`.
7. Assert the update affected exactly 29 rows and validate the final radius and
   aggregate distributions.
8. Verify `/api/health`, `/places`, mobile navigation/controls, associated posts
   and Vercel runtime errors.
9. Record final deployment, commit, branch and data evidence in a follow-up
   documentation PR.

## Rollback triggers

- GitHub checks fail or Preview is not READY: do not merge.
- Production deployment is not READY: keep the current Production alias and
  inspect build logs.
- Neon update count is not exactly 29: transaction must fail and roll back.
- Health, Places rendering, linked-post loading or runtime logs regress after
  release: roll Vercel back to deployment `dpl_2GFsngT1j5DtoypxtnGFpobUu4Po`.

## Data rollback

The named Neon branch preserves the exact pre-update state. If only the bounded
radius correction must be reversed, retrieve the 29 matching place IDs from the
backup branch and transactionally restore those IDs to 25,000 m. Do not restore
the whole branch after new writes without first reconciling them.

## Observability

- Vercel deployment state and build logs;
- `/api/health` database/version response;
- `/places` HTTP response and browser interaction;
- grouped Vercel runtime errors for the first post-deploy window;
- Neon before/after distributions and unchanged relation aggregates.
