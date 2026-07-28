# Promote Places schema to Production

Date: 28 July 2026  
Mode: Critical  
Scope: Neon schema only

## Outcome

Migration `20260723150157_add_places_domain` was applied transactionally to the
Neon Production branch `main` (`br-super-snow-asyrmnbm`). This promotion adds the
four Places tables, their constraints and their indexes. It does not activate
the global worker, deploy the web application or import Places data.

## Safety controls

- created backup branch `backup-main-before-places-2026-07-28`
  (`br-crimson-breeze-asuorv4a`) before changing Production;
- rehearsed the exact migration transaction on a disposable branch and deleted
  that disposable branch after verification;
- applied only the existing additive F1 migration;
- retained the backup branch for rollback and investigation;
- did not run `prisma db push`, seeds or the Phase E worker migration.

## Verification evidence

| Check | Result |
| --- | --- |
| Migration checksum | `1b8b3fe5857a8fab3387b07feeaf34d565155c20c54611283d0b3b84260dea57` |
| Migration state | Finished, not rolled back, one applied step |
| Places tables | `places`, `post_places`, `place_evidence`, `place_analysis_jobs` present |
| Existing posts | 3,461 preserved |
| Initial Places rows | 0 in every Places table |
| Required constraints | 13 present |
| Required indexes | 17 present |
| Neon schema diff | Empty between `develop` and Production `main` after promotion |

## Subsequent release completion

The reviewed application was promoted by PR #47 to `main` at `66cfd78`. CI #145
passed and Vercel Production deployment `dpl_G7R5i5jGWihyqRTNbsqdgdwK3HZ7`
reached `READY`. Health and `/places` returned HTTP 200 with no runtime error.

The importer then exposed its reviewed Phase E queue-column dependency. A second
backup, `backup-main-before-phase-e-2026-07-28` (`br-bold-salad-asxuxn2s`), was
created. The exact additive Phase E migration was rehearsed on a disposable
branch, verified through the importer public seam, and promoted transactionally
with checksum
`4c7b1d89faf0690bc9927f5966f12163403544e3a0bbd1159b8de153e7129bae`.
This schema promotion does not activate or deploy the VPS worker.

The candidate file with SHA-256
`27d9f9e69631190cbe4cf344a64fe82e7f67a441bf19faba4844770204cc4a87`
was committed to Production through the existing importer:

| Check | Result |
| --- | --- |
| Records | 407 valid, 0 invalid |
| Outcomes | 307 succeeded, 100 need review, 0 failed |
| Unknown candidates | 154 |
| Importer errors | 0 |
| Final unique rows | 51 places, 301 links, 1,203 evidence, 407 jobs |
| Linked posts | 254 |
| Job states | 307 `SUCCEEDED`, 100 `NEEDS_REVIEW` |
| Safety invariants | 0 owner mismatches, 0 errored jobs, 0 approximate places without radius |

The importer report counts persistence operations, so its `placesPersisted` and
`linksPersisted` values are not final unique-row counts. The catalog aggregates
above are the authoritative post-import state.

## Remaining gates

VPS worker deployment and activation remain separate and pending. Phase H stays
blocked until that operational gate is explicitly approved and verified. The
extension 4.2.6 authenticated Production refresh smoke also remains an operator
action.
