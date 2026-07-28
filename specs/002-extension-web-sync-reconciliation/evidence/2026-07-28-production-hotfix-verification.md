# Production hotfix verification

Date: 2026-07-28
Branch: `codex/hotfix-extension-sync-prod`
Production base: `origin/main` at `fd9754eb011a5f45a59bc3e5d6a053e9db808e62`
Source correction: squash `ba56573d66c1bf595a4d8f0551591a5eb423e453`

## Scope decision

Promoting `develop` directly would include 276 files, about 24,700 added lines,
two Prisma migrations and unrelated Places/worker phases. The hotfix therefore
ports only the 24-file extension/web reconciliation correction to `main`.

No migration, dependency, new API route, R2 permission, authentication change,
host permission or worker deployment is included. The existing authenticated
`GET /api/sync/jobs/{id}` route is reused.

## Fresh local gates on the production base

- `npm ci`: PASS; 572 packages installed. Existing audit output reports 12 high
  findings; no breaking audit fix was applied.
- `npm run db:generate`: PASS; client generation only, no migration.
- focused policy and UI tests: PASS, 7/7.
- `npm run lint`: PASS.
- `npm run typecheck`: the Windows sandbox could not update
  `tsconfig.tsbuildinfo`; `npx tsc --noEmit --incremental false` passed with no
  type errors.
- `npm run test`: PASS, 149 passed and 22 skipped.
- `npm run build`: PASS, 27 pages generated.
- `git diff --check`: PASS.

## Rollout and rollback

Rollout is a PR from this hotfix branch to `main`, followed by Vercel Production
status verification and read-only smoke checks. Rollback is a revert of the
hotfix merge; do not delete synchronized posts or replace the extension archive.

Hosted checks, the final Production deployment identifier and runtime smoke are
recorded after the PR is pushed and merged.
