# Places analysis JSON export - Local verification

Date: 2026-07-28
Revision: `codex/places-analysis-json-export` working tree based on
`f74302b3bba6bf9bd29ab66d6ef8fbc32d5479b3`

## Evidence

| Claim | Command | Result | Evidence summary |
| --- | --- | --- | --- |
| Locked install | `npm ci` | PASS | 638 packages added; 12 HIGH audit advisories reported as unchanged dependency baseline. |
| Prisma client | `npm run db:generate` | PASS | Prisma Client 6.19.3 generated. |
| Export contract | focused Vitest command | PASS | 45 passed; strict JSON, targets, text, safety, order, and existing contracts. |
| PostgreSQL seam | focused PostgreSQL file | ENV BLOCKED | 13 tests discovered and skipped because `TEST_DATABASE_URL` is absent. |
| Lint | `npm run lint` | PASS | zero warnings or errors. |
| Types | `npm run typecheck` | PASS | exit 0. |
| Full unit suite | `npm test` | PASS | 47 files / 361 tests passed; 11 files / 130 tests skipped for environment-bound suites. |
| Production build | `npm run build` | PASS | Next.js 16.2.10 compiled, typed, and generated 32 pages. |
| Patch hygiene | `git diff --check` | PASS | no whitespace errors. |
| Generated file ignored | `git check-ignore -v .tmp/places/places-analysis-input.json` | PASS | ignored by `.gitignore` line 16 (`.tmp/`). |
| Missing production target | requested npm command | EXPECTED FAIL | `TARGET_DATABASE_NOT_CONFIGURED` plus the minimal explicit-variable instruction; no file fabricated. |

## Original scenario

The requested command was invoked with `--all --target production` and the exact
output path. Because `PLACES_PRODUCTION_DATABASE_URL` is not configured, it
failed closed before importing Prisma or creating the output. The failure logged
no caption, DSN, credential, stack, Geoapify value, or R2 value.

## Traceability status

All implementation requirements are verified by automated tests, static review,
or the expected environment gate. The actual production counts and artifact
remain intentionally unverified.

## Unverified areas and limitations

- No `TEST_DATABASE_URL`: 13 PostgreSQL caption-workflow tests skipped.
- No `PLACES_PRODUCTION_DATABASE_URL`: no production query and no final JSON.
- The repository-managed VibeSpec bundle uses `.vibespec/bundle`; its legacy
  installation validator expects `.vibespec/manifest.json` and
  `.vibespec/config.json`, so that legacy command is incompatible with this
  layout. Required change artifacts were validated directly instead.

## Residual risks

- Production throughput at the real eligible-post count is not measured until
  the explicit target exists.
- The operator must use a database role with read permissions only; application
  code contains no mutation path but cannot reduce privileges embedded in a DSN.
