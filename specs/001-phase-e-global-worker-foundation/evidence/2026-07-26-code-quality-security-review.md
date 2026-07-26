# Code quality and security review — 2026-07-26

Scope: worker source, migration/grants, tests, container, CI and dependency
impact. Verdict: PASS with no open code HIGH/BLOCKER finding.

Findings corrected during the pass:

1. Connected the R2 adapter through a per-claimed-job authorized-client factory
   and guaranteed closure in `finally`.
2. Required `WORKER_DATABASE_URL` in production so the web `DATABASE_URL` cannot
   silently grant broader database privileges.
3. Replaced handler-provided persisted messages with stable safe messages.
4. Made heartbeat/client cleanup failures unable to skip workdir removal.
5. Terminalized an expired lease that already consumed its effective final
   attempt instead of leaving it stuck in `PROCESSING`.

Additional review results:

- All SQL is static/parameterized and every data statement binds the configured
  owner. Transaction control statements are the only owner-free commands.
- Grants permit only listed SELECT/queue-state UPDATE columns and deny inserts,
  deletes, media URLs and unrelated domain writes.
- The R2 surface constructs the account endpoint and exposes no put/delete/list
  or arbitrary URL path.
- Filesystem deletion is restricted to direct resolved children; the real
  junction/symlink test preserves the outside sentinel.
- Logger core fields cannot be forged and secret replacement precedes bounds.
- The production registry is empty; only the smoke script imports noop.
- The image contains no secret value, runs non-root, publishes no port and drops
  all capabilities.

Dependency note: fresh `npm ci` reports the repository baseline of 12 HIGH audit
findings (the worker production install summary reported one). The same 12-HIGH
baseline existed before Phase E, no automatic/breaking audit fix was authorized,
and the only new driver is pinned `pg@8.22.0`; this is recorded as a repository
dependency follow-up rather than hidden or claimed fixed.
