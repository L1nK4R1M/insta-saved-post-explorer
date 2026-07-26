# Local verification — 2026-07-26

Environment: Windows worktree, Node.js 24, PostgreSQL 16 Docker container and
Docker Desktop 29.2.1. Database targets were dedicated names ending in `_test`.
No hosted database or VPS was contacted.

| Command / proof | Exit | Result |
|---|---:|---|
| `npm ci` | 0 | 638 packages installed from lockfile; npm reported the existing audit baseline of 12 HIGH findings. No autofix run. |
| `npm run db:generate` | 0 | Prisma Client 6.19.3 generated. |
| Fresh `prisma migrate deploy` | 0 | All 10 migrations applied to a new PostgreSQL 16 `_test` database. |
| `TEST_DATABASE_URL=<ephemeral> npm run worker:test` | 0 | 6 files, 49 tests passed, 0 skipped. |
| `TEST_DATABASE_URL=<ephemeral> npm test -- media-identity-postgres.test.ts` | 0 | 1 file, 6 tests passed. |
| `npm run lint` | 0 | Zero warnings. |
| `npm run typecheck` | 0 | Passed. |
| `npm test` | 0 | 43 files / 319 tests passed; 11 files / 129 PostgreSQL tests skipped without the root test DSN. |
| `npm run build` | 0 | Next.js 16.2.10 production build passed; 32 static pages generated. |
| `docker build -f services/worker/Dockerfile ...` | 0 | Multi-stage worker image built. |
| `npm run worker:smoke` | 0 | One isolated fixture claimed and completed; fixture/workdir cleanup passed. |
| Docker runtime inspection | 0 | `10001:10001`, ports `{}`, `healthy`, running `true`. |
| `docker compose ... down` | 0 | Worker container and private network removed after proof. |
| VibeSpec validation/traceability | pending final metadata | Run again after PR handoff metadata is recorded. |

The recurring jsdom canvas notices in the root test output are the known baseline
and did not fail a test. The online detailed audit was not run because it would
send dependency metadata externally; an offline cache-only audit reported zero
but is not treated as authoritative over the fresh `npm ci` summary.
