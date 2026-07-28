# Places address contract - Release plan

Release gate: DEVELOP_READY_PRODUCTION_BLOCKED

## Develop evidence

- PR #52 squash-merged at `71106cc75ab16c5746c452f9332ef30df51557ca`.
- GitHub CI #153 passed all jobs.
- Vercel Preview `dpl_632ZKgw3HdT6XwuCfynP3RQkBZBc` is READY; its immutable
  URL returned HTTP 200.
- A schema-v3 export of post `cmrfhnykb000hjs04ndgb3avh` from Neon develop
  completed read-only (`business_writes=false`) and the local artifact was
  removed.
- The owner authorized the real Geoapify dry-run. It returned `amenity`, rank 1,
  `inner_part`; refined scoring returns `EXACT`, confidence 1, radius null.
- The importer exits 0 and reports 1/1 success with `committed=false`; the
  develop database still has exactly its original one approximate primary link.
- The duplicate-link audit proved a committed import needs narrow supersession
  of that old automatic approximate primary before data writes are safe.
- PR #54 squash-merged on develop at
  `f98da30c49b9cd1dc07b7c006900fdca9ece81f0`.
- CI #157 passed, including the real PostgreSQL supersession invariant and
  Playwright.
- Vercel develop deployment `dpl_GWMGkdvQptBCz1icJidE6zUJM8vL` is READY and
  returns HTTP 200 at its immutable root.
- The final dry-run from merged `develop` processed 1/1 post with exit 0,
  `committed=false`, zero errors, and no Neon link-count change.

## Migration plan

There is no Prisma or Neon schema migration. The contract transition is
application-level: input schema v3, required nullable candidate `address`, and
default analysis version `places-v2`.

## Develop rollout

1. Open the branch against `develop`. Because its base is current `main`, the PR
   first reconciles the seven already approved Production commits missing from
   `develop` and retains the 10 km radius.
2. Require GitHub CI and a READY Vercel Preview.
3. Export only post `cmrfhnykb000hjs04ndgb3avh` from the develop database under
   schema v3.
4. Generate candidate JSONL containing the exact caption address and dry-run the
   importer without `--commit`.
5. Verify Geoapify returns a specific address/building with strong rank and
   match type, and inspect whether the old automatic city link would coexist.
6. Treat any develop data commit as a separate operator decision.

Steps 1 through 5, the follow-up code gate, and the final merged-revision dry-run
are complete. Step 6 remains a separate owner decision.

## Production gate

Production code and data remain unchanged until the owner explicitly approves
after CI, Preview, the real single-post dry-run, duplicate-link analysis, and
runtime error checks are clean.

## Rollback

- Before Production: close/revert the develop PR; no database rollback.
- After a later Production promotion: restore the preceding Vercel deployment or
  revert the reviewed commits. Any later data correction must define its own
  backup and row-scoped rollback before execution.

## Observability

Monitor CI, Vercel build/runtime logs, `/api/health`, importer stable error codes,
provider result type/rank/match type, final precision/radius, post/place link
counts, and duplicate automatic links for the selected post.

## Stop conditions

- real provider result is only city/district or rank below 0.90;
- provider match type is neither full/building nor `inner_part` at rank 0.95+;
- a house-number contradiction appears;
- the new exact result would silently leave a misleading automatic city link;
- any secret/caption leakage, quality-gate failure, or Preview runtime error.
