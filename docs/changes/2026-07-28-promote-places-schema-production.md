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

## Remaining gates

The reviewed application code must still be promoted through a pull request and
verified on Vercel Production. Candidate import is a separate controlled write
and must target the verified Production database with zero invalid records and
zero importer errors. Phase E hosted migration and VPS activation remain out of
scope.
