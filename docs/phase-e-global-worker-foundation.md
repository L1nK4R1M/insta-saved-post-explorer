# Phase E — Global worker foundation

Status: implemented locally; final repository verification and PR pending  
Reference: `develop@f79320c819e94bfdd3b66539c1178d62a201afbf`  
Branch: `claude/phase-e-global-worker-foundation`

## Brownfield discovery

The repository already has a single PostgreSQL database, canonical R2 media
identity, an owner-scoped `place_analysis_jobs` table and the restricted
`ipe_worker_reader` role. It has no VPS worker process, transactional claim,
job-level retry scheduler, workdir lifecycle, worker health server or worker
container. `ImportJob` and `SyncJob` are progress ledgers and are not suitable
queues. The existing Places table is therefore reused; no Redis and no second
queue are introduced.

The local main checkout contained unrelated user changes and lagged the remote.
Implementation uses an isolated worktree from the requested remote SHA, leaving
those files untouched. The clean unit baseline is 319 passing tests plus 129
PostgreSQL tests skipped without `TEST_DATABASE_URL`.

## Requirements identified

- One `insta-post-explorer-worker` under `services/worker`.
- Required single-owner scope via `WORKER_OWNER_ID`.
- Transactional zero-or-one claim, lease, heartbeat, bounded retry and crash recovery.
- Handler registry with schema validation and cancellation.
- Read-only R2 streaming from persisted `VERIFIED` identity only.
- Unique contained workdir, cleanup in every exit path, startup cleanup and janitor.
- Internal liveness/readiness and bounded shutdown.
- Non-root Docker image and one Compose service with zero published ports.
- Ephemeral foundation smoke proof with no production noop registration.
- Risk-based tests and complete VibeSpec traceability.

## Architecture

```text
services/worker
├── config + JSON logger
├── health/live + health/ready
├── pg pool + owner-scoped job repository
├── GetObject-only R2 adapter
├── handler registry
├── runner, heartbeat, retry and shutdown
├── contained temp-workdir manager
└── Docker entrypoint
```

The root becomes a small npm workspace so web and worker share one lockfile.
The worker uses `pg` rather than the generated Prisma client, keeping SQL,
transactions and granted columns explicit. Existing Next.js behavior and root
commands remain compatible.

## Job state model

```text
PENDING -> PROCESSING -> SUCCEEDED
                      -> PENDING (retry wait)
                      -> FAILED

PROCESSING with expired lease -> PROCESSING by a new claimant
```

Existing `NEEDS_REVIEW`, `SUCCEEDED`, `FAILED` and `CANCELLED` rows are terminal
for Phase E claiming. `leaseOwner` is the claimant. Existing `errorCode` and
`errorMessage` carry bounded sanitized failure state. The migration adds nullable
`claimedAt` and `nextAttemptAt`; it does not add a new table or enum.

## Claim pseudo-SQL

```sql
WITH candidate AS (
  SELECT id
  FROM place_analysis_jobs
  WHERE owner_id = $1
    AND attempt_count < LEAST(max_attempts, $2)
    AND (next_attempt_at IS NULL OR next_attempt_at <= now())
    AND (status = 'PENDING'
      OR (status = 'PROCESSING' AND lease_expires_at < now()))
  ORDER BY priority DESC, created_at ASC, id ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1
)
UPDATE place_analysis_jobs job
SET status = 'PROCESSING', lease_owner = $3, claimed_at = now(),
    heartbeat_at = now(), lease_expires_at = now() + $4::interval,
    attempt_count = attempt_count + 1, next_attempt_at = NULL,
    updated_at = now()
FROM candidate
WHERE job.id = candidate.id AND job.owner_id = $1
RETURNING job.*;
```

All heartbeat, retry and terminal updates additionally compare job id, owner,
claimant, `PROCESSING` status and an unexpired lease.

## Lease and heartbeat

Heartbeat is strictly shorter than one third of the lease by configuration.
Renewals run sequentially: the next timer starts only after the current database
operation settles, so slow calls cannot overlap. Renewal is a compare-and-set
update. Zero affected rows or a database exception means lease loss: abort the
handler, stop scheduling renewal and never finalize. Stopping the heartbeat
awaits its active renewal. An expired lease is available to a new claimant on
its next transaction.

## Retry

Attempts count claims. Retryable failure before the effective maximum returns to
`PENDING` with deterministic capped exponential backoff and future
`nextAttemptAt`; no default jitter is used so behavior is reproducible. Terminal
errors and exhausted attempts become `FAILED`. The claim transaction also
terminalizes already-exhausted owner-scoped `PENDING` rows, including rows whose
future `next_attempt_at` would otherwise make them permanently unclaimable.
Unknown exception text and stacks are not persisted.

## Shutdown

SIGTERM and SIGINT set a stopping flag synchronously, cancel polling and refuse
new claims. The current handler keeps running, with heartbeat renewal active,
for up to 30 seconds by default. Its abort signal fires only when that deadline
expires. A deadline abort is never persisted as a terminal business failure: it
returns the job to `PENDING` with `WORKER_STOPPING` when the guarded retry can
still prove lease ownership, or leaves recovery to lease expiry when PostgreSQL
is unavailable. Cleanup and resource closure then run once; repeated stop calls
share the same promise.

## Security

- Static parameterized SQL only.
- Required owner predicate on every job/post/media query.
- Column-level grants extended on the existing NOLOGIN role only.
- Database-authoritative media authorization scoped to the claimed job. Handlers
  receive only media ids and safe metadata, never an object key or S3 client.
- Canonical persisted R2 key, fixed account/bucket/prefix and GetObject-only API.
- No URL supplied by payload and no list/put/delete operation.
- Opaque workdir names and resolved containment checks.
- Symlinks/junctions are never followed by janitor deletion.
- Secret values, captions, payloads and DSNs are excluded from logs and health.
- No public port, command endpoint or root container user.

## R2

Root deployment keeps `R2_WORKER_ACCESS_KEY_ID` and
`R2_WORKER_SECRET_ACCESS_KEY` distinct from web upload credentials. Compose maps
them into the worker's private `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY`.
`R2_ACCOUNT_ID` constructs the Cloudflare S3 endpoint, avoiding an arbitrary
endpoint. Streaming stops at the configured byte cap and removes partial files.
The handler-facing capability exposes only `listVerified()` and
`downloadToWorkdir(mediaId, ...)`. Both resolve through an owner/post-scoped
repository; download repeats the `VERIFIED` and non-null canonical-key predicate
before issuing `GetObject`. The bucket, allowed prefix and maximum size remain
worker configuration and cannot be supplied by a handler.

## Workdir

Each job receives a unique directory beneath an explicit absolute
`WORKER_TEMP_ROOT`. Cleanup runs in `finally` after success, exception,
cancellation and shutdown. Startup plus periodic janitor delete direct stale
children older than six hours by default, while refusing the filesystem root,
out-of-root paths and linked directories.

## Docker and Coolify

The Dockerfile is multi-stage, Node 24, non-root and minimal. Compose declares
one `insta-post-explorer-worker`, an internal healthcheck, dropped capabilities,
`no-new-privileges`, bounded temporary storage and no `ports` entry. No reverse
proxy, domain, dashboard, Redis or SaaS integration is included. Coolify/VPS
deployment remains unauthorized until credentials, firewall, backup and alerts
are reviewed.

## Critical tests

The planned consolidated tests prove: concurrent single winner, expired lease
reclaim, claimant-only heartbeat, stale-finalization refusal, bounded retry,
cleanup after success/error/cancellation, root-contained janitor, invalid
dispatcher input, smoke completion, unavailable-DB readiness, invalid config,
restricted grants/R2 surface, SIGTERM and container non-root/no-port behavior.

## Acceptance criteria

Phase E passes only when one ephemeral smoke job is claimed and completed, an
expired lease is reclaimed, two workers cannot process the same claim, stale
claimants cannot finalize, no workdir remains after success or exception, the
restricted DB/R2 boundaries hold, shutdown is clean, health is internal, the
container is non-root, Compose publishes no port, repository quality gates pass,
and VibeSpec convergence records `Decision: PASS`.

## Limits

- No real Places handler or deep analysis is registered.
- No hosted VPS, Coolify, firewall, backup or alert proof is claimed.
- No production migration or credential provisioning is performed.
- One process handles one job at a time in Phase E.

## Deferred to Phase H and J

Phase H owns actual media processing, FFmpeg, OCR, transcription, multimodal
analysis, provider budgets and the real Places handler. Phase J owns MCP/Hermes,
API client tooling and confirmation policies. Neither phase may access the
database through a new direct path or broaden the Phase E worker implicitly.

## Local implementation evidence — 26 July 2026

- Fresh PostgreSQL 16 database `ipe_phase_e_review_fix_test`: all 10 migrations
  applied successfully.
- Worker suite with database enabled: 6 files and 59/59 tests passed; the
  dedicated leasing/media authorization suite passed 11/11.
- Repository suite with database enabled: 54 files and 448/448 tests passed.
- Lint, root and worker typechecks, Next.js build and worker build passed.
- Ephemeral smoke: one fixture claimed, completed and removed; no workdir remained.
- Docker image: built successfully; Compose resolved; a real container configured
  with port `8181` reported `10001:10001`, health `healthy` and published ports
  `{}`. The task-owned container was stopped and removed afterward.

These are local proofs only. No hosted migration, worker login, R2 credential,
VPS/Coolify service, firewall, backup, alert or production deployment was
created or changed.
