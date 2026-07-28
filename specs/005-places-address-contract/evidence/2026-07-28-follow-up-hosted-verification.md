# Places address contract - Follow-up hosted verification

Date: 28 July 2026

## GitHub

- PR: #54
- reviewed head: `6e098fbc64bfd3fb3caf36b37c84ed5f49a77db8`
- squash merge on develop: `f98da30c49b9cd1dc07b7c006900fdca9ece81f0`
- CI: #157 (`30398965863`), success
- lint/types/unit/build job: success
- ephemeral PostgreSQL supersession invariant: success
- worker PostgreSQL and container checks: success
- browser tests: success
- open review threads: 0

## Vercel develop

- deployment: `dpl_GWMGkdvQptBCz1icJidE6zUJM8vL`
- branch: `develop`
- commit: `f98da30c49b9cd1dc07b7c006900fdca9ece81f0`
- state: READY
- immutable deployment root: HTTP 200

## Boundary

The final merged-revision validation exported schema v3 from `f98da30`, then ran
the authorized single-post Geoapify import without `--commit`:

```text
exit=0
committed=false
postsProcessed=1
postsSucceeded=1
postsFailed=0
postsNeedingReview=0
unknownCandidates=0
errors=[]
```

The post still has one automatic approximate primary and zero exact links on
Neon develop afterward. No Prisma migration, Neon data write, or Production
deployment occurred. Any `--commit` remains a separate owner decision.
