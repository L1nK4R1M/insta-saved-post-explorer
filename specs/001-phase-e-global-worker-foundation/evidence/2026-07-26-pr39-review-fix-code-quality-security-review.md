# PR #39 review-fix code quality and security review

Date: 2026-07-26  
Scope: fresh pass after specification-compliance review

## Result

PASS. No open code-quality/security HIGH or BLOCKER finding.

## Review notes

- The media repository uses static parameterized SQL and binds owner, post and
  media id. The safe list query does not select object keys; only the internal
  download lookup receives the persisted key.
- The handler-facing object has exactly `listVerified` and
  `downloadToWorkdir`. No Put/Delete/List operation, arbitrary endpoint, bucket,
  prefix, key, close method or general S3 client crosses that boundary.
- The R2 adapter still enforces canonical prefix, size cap, abort propagation,
  contained output and partial-file cleanup. Database failure remains retryable;
  missing or ineligible media fails before any R2 call.
- Sequential heartbeat scheduling has one timer and one active promise. Lease
  loss is emitted once, the next renewal is not scheduled after loss/stop, and
  stop awaits an active database call.
- Shutdown is idempotent and separates synchronous stop intent from deadline
  cancellation. Runner finalization cannot turn deadline cancellation into a
  terminal business error.
- Exhausted pending terminalization is owner-scoped, preserves under-limit and
  terminal rows, and clears claimant/lease/heartbeat/retry state consistently.
- The transaction helper owns BEGIN/COMMIT/ROLLBACK/release on one client. Temp
  root checks operate on raw input before normalization. Docker health follows
  runtime configuration and the image remains non-root/read-only/no-port.
- Tests exercise public seams and critical negative boundaries with a disposable
  PostgreSQL 16 database; no duplicated migration or production-only test hook
  was introduced.

`git diff --check` is clean. Package manifests, lockfile, Prisma schema and the
existing Phase E migration are unchanged by this correction round. `npm ci`
still reports 12 high-severity dependency advisories from the unchanged lockfile;
dependency upgrades are outside this narrowly reviewed correction and were not
silently applied.
