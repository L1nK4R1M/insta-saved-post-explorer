# Places address contract verification report

**Date:** 2026-07-28  
**Revision:** `codex/places-address-contract` working tree based on `bebf680`

## Evidence

| Claim | Command or observation | Result | Evidence summary |
|---|---|---|---|
| Expected regressions were initially absent | focused Vitest RED run | Pass | 9 expected failures across contract, export, resolver, and scoring |
| Address contract and scoring work | focused Vitest | Pass | 92 passed; 24 PostgreSQL tests skipped without test DSN |
| Repository behavior remains healthy | full Vitest | Pass | 370 passed; 130 environment-bound skips |
| Static quality | lint + typecheck | Pass | zero lint warnings and zero TypeScript errors |
| Production compilation | Next build | Pass | optimized build; 32 routes/pages generated |
| Database client | Prisma generate | Pass | Prisma Client 6.19.3 generated from repository schema |
| Patch hygiene | `git diff --check` | Pass | no whitespace error |

## Original scenario

The deterministic regression uses the observed Instagram handle and
`12 rue de l'Independance Americaine, 78000 Versailles`. With a Geoapify
building/full_match/rank 0.96 response, the result is `EXACT`, confidence 0.96,
and no radius. The same candidate resolved only as a city stays
`APPROXIMATE` at 10,000 metres.

## Traceability status

Verified locally. All requirements are covered and both fixed-diff reviews have
no finding.

## Unverified areas and limitations

- PostgreSQL integration suites are defined but skipped without
  `TEST_DATABASE_URL` (24 focused, 130 full environment-bound skips overall).
- No live Geoapify secret was used; provider behavior still needs the planned
  single-post develop/Preview dry-run.
- No Vercel Preview, GitHub CI, Neon write, import commit, or Production action
  is claimed.
- `npm install` reported 12 high-severity dependency advisories already present
  in the locked dependency graph; package manifests and lockfile are unchanged
  by this change.

## Residual risks

- A places-v2 re-analysis may produce a new exact link while an old unconfirmed
  city link still exists. The release plan stops before commit until this is
  audited on develop.
