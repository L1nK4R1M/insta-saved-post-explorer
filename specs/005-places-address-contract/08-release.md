# Places address contract - Release plan

Release gate: READY_FOR_DEVELOP_PR

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
- provider match type is not full/building;
- a house-number contradiction appears;
- the new exact result would silently leave a misleading automatic city link;
- any secret/caption leakage, quality-gate failure, or Preview runtime error.
