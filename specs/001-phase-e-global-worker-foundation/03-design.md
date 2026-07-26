# Phase E Global Worker Foundation - Technical Design

## Design summary

`services/worker` is a private npm workspace and the only VPS worker process.
It uses a narrow PostgreSQL repository over `place_analysis_jobs`, scoped by the
required configured owner. The runner claims one job, creates an isolated
workdir, starts claimant-only heartbeat, dispatches a validated handler, and
finalizes only while its lease remains valid. PostgreSQL owns scheduling and
recovery; the filesystem owns transient bytes; R2 remains read-only. Phase E
registers no real Places handler and proves the runtime with an ephemeral
test-only noop.

## Repository impact map

| Module or service | Current responsibility | Planned change | Compatibility risk |
|---|---|---|---|
| Root npm package | Next.js scripts and single lockfile | Add `services/worker` workspace and aggregate worker scripts. | Install/CI regression; verified by existing gates. |
| Prisma schema/migrations | Application and Places persistence | Add claim/retry timestamps, queue index and grants. | Additive schema and privilege drift. |
| `services/worker` | Absent | New config, DB, runtime, R2, health and Docker modules. | New operational boundary. |
| Existing Places services | Synchronous F2 workflow | No behavior change; new columns remain nullable/defaulted. | Raw SQL must preserve existing statuses. |
| CI | Web quality gates | Install/test/build worker and inspect container contract. | Runtime increase; keep tests consolidated. |
| Deployment/operations docs | Vercel and Phase C worker prep | Add local worker/Coolify contract without deploying. | Documentation must distinguish proof from future operations. |

## Architecture and dependency flow

```text
index/config
  -> health server
  -> PostgreSQL job repository
  -> handler registry
  -> worker runner
       -> lease heartbeat
       -> temp-workdir manager
       -> authorized R2 reader
       -> handler(job context)
       -> guarded finalization/retry

Application producer -> place_analysis_jobs <- restricted worker login
                                           -> VERIFIED post_media -> read-only R2
```

Dependency rules:

- Handlers depend on stable context interfaces, never concrete `pg` or S3 clients.
- The repository owns SQL and state transitions; the runner cannot build SQL.
- The workdir manager owns all recursive deletion and validates containment.
- The R2 adapter accepts persisted media identity, never a URL or payload path.
- Health observes readiness but exposes no mutation or detailed state.

## Runtime flows

### Success flow

1. Parse configuration; build the DB pool, handler registry and health server.
2. Startup janitor removes only stale directories beneath the configured root.
3. Polling asks the repository to claim one supported owner-scoped job.
4. A single transaction locks one eligible row with `SKIP LOCKED`, changes it
   to `PROCESSING`, increments attempts, sets claimant, claim time, heartbeat and
   lease expiry, then commits.
5. Create a unique workdir and start heartbeat at the configured interval.
6. Parse the job into the registered handler's payload and run it with an abort
   signal and authorized context.
7. Guarded success finalization requires the same owner, claimant, status and
   unexpired lease. A zero-row update is lease loss, never success.
8. Stop heartbeat and delete the workdir in `finally`.

### Failure and degraded flows

- Invalid job/payload: terminal failure with a stable safe code.
- Retryable error before max attempts: guarded update returns the row to
  `PENDING`, sets deterministic `nextAttemptAt`, stores safe error fields and
  clears claim/lease fields.
- Exhausted/terminal error: guarded transition to `FAILED`.
- Lease loss: abort handler, skip all finalization, clean up and let the current
  database claimant own state.
- Database unavailable: readiness fails and polling uses bounded delay; no
  in-memory claim is invented.
- SIGTERM/SIGINT: set stopping state before any await, cease polling, abort after
  the shutdown deadline, stop timers, clean up and close resources.
- R2 stream failure: destroy partial file, classify the stable error and use the
  normal guarded retry/terminal path.

## Data model and lifecycle

Add nullable `claimed_at TIMESTAMPTZ(3)` and
`next_attempt_at TIMESTAMPTZ(3)` to `place_analysis_jobs`. Existing rows remain
compatible. New and retried jobs are eligible when `next_attempt_at IS NULL OR
next_attempt_at <= now()`. `PENDING` rows and `PROCESSING` rows whose lease has
expired may be selected. Claim sets `next_attempt_at = NULL`. Successful and
terminal transitions clear claim/lease fields but keep attempt history and
bounded error/result state.

The smoke fixture is a valid owner-scoped Places job in an ephemeral database.
It is never inserted into a shared environment. No generic job table or payload
column is added.

Temporary directories use a generated opaque directory name beneath the
resolved root. Payload data never controls paths. Every job directory is deleted
after execution; the janitor only examines direct children and refuses symlinked
or out-of-root targets.

## Concurrency, idempotency, retries, and ordering

Claim pseudo-SQL:

```sql
WITH candidate AS (
  SELECT id
  FROM place_analysis_jobs
  WHERE owner_id = $1
    AND attempt_count < LEAST(max_attempts, $2)
    AND (next_attempt_at IS NULL OR next_attempt_at <= now())
    AND (
      status = 'PENDING'
      OR (status = 'PROCESSING' AND lease_expires_at < now())
    )
  ORDER BY priority DESC, created_at ASC, id ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1
)
UPDATE place_analysis_jobs AS job
SET status = 'PROCESSING', lease_owner = $3, claimed_at = now(),
    heartbeat_at = now(), lease_expires_at = now() + $4::interval,
    attempt_count = attempt_count + 1, next_attempt_at = NULL,
    updated_at = now()
FROM candidate
WHERE job.id = candidate.id AND job.owner_id = $1
RETURNING selected safe columns;
```

All later updates include `owner_id`, `id`, `lease_owner`, `status =
'PROCESSING'` and `lease_expires_at > now()`. This makes heartbeat and
finalization compare-and-set operations. Retry delay is
`min(cap, base * 2^(attempt-1))` with no default jitter; tests use an injected
clock. Existing job idempotency remains unchanged.

## Error handling

Errors implement a small classification contract: stable code, retryable flag
and safe bounded message. Unknown exceptions become `WORKER_UNEXPECTED` without
persisting their raw message or stack. Configuration failures print field names,
not values. Logs include `workerId`, `ownerId`, `jobId`, `attempt` and event name;
they never include payload bodies, captions, DSNs, keys or media bytes.

## Security and privacy

### Data classification

- Secrets: database DSN and R2 credentials; environment-only and never logged.
- Sensitive owner data: job/post/media identifiers, object keys and media bytes;
  server-side only and minimally logged.
- Operational data: worker id, state transition, durations and stable error
  codes; safe for structured logs.
- Public data: none. Health endpoints are internal and intentionally sparse.

### Trust boundaries

1. Environment to configuration parser: strings are untrusted until validated.
2. PostgreSQL rows to dispatcher: job fields and payload are untrusted until
   owner and schema validation succeeds.
3. R2 metadata/stream to filesystem: size and key are revalidated before write.
4. Handler to runner: results/errors cannot finalize without repository CAS.
5. Host/container to health server: bind local by default and publish no port.

### Threat model

| Risk ID | Threat | Entry point | Impact | Mitigation | Verification |
|---|---|---|---|---|---|
| RISK-001 | Cross-owner claim | SQL selection | Privacy breach | Required owner config and owner predicate on every statement. | PostgreSQL owner isolation test. |
| RISK-002 | Duplicate execution/finalization | Concurrent workers | Corruption | `SKIP LOCKED`, leases and guarded updates. | Two-worker and stale-finalization tests. |
| RISK-003 | SQL injection | Identifiers/payload | DB compromise | Static SQL and positional parameters only. | Review plus malicious input test. |
| RISK-004 | Arbitrary R2 access | Object key or URL | Data exfiltration | VERIFIED persisted key, owner/post match, fixed bucket/prefix, GetObject only. | R2 contract tests. |
| RISK-005 | Path traversal or symlink escape | Workdir and janitor | Host deletion/read | Opaque names, resolved containment, lstat, no followed symlink. | Consolidated filesystem security tests. |
| RISK-006 | Secret leakage | Logs/errors/health | Credential exposure | Redaction and stable bounded errors. | Secret corpus test. |
| RISK-007 | Public management surface | Docker/health | Remote probing/control | Loopback default, no command endpoint, no published port. | Compose inspection and container proof. |
| RISK-008 | Root/container breakout | Image runtime | Host impact | Non-root user, cap drop, no-new-privileges, read-only filesystem where viable. | Container identity and Compose proof. |

## AI and tool-safety controls

No AI, model, prompt, OCR, transcription or multimodal tool exists in Phase E.
The future handler boundary treats all payload data as untrusted and requires
explicit schema parsing before execution. No shell-command capability is exposed
to handlers by this foundation.

## Performance and capacity

One process handles at most one job concurrently in Phase E. Polling is bounded
and configurable; an idle worker performs one indexed claim query per interval.
The claim index matches owner, state/time and priority ordering. Media download
is streamed with a byte cap rather than buffered. Health operations have a
two-second budget. No horizontal-scaling claim is made beyond the tested safety
of two concurrent worker identities.

## Observability

Structured JSON logs cover startup, readiness changes, claim, handler start,
heartbeat failure, retry scheduling, terminal failure, completion, cleanup,
janitor actions and shutdown. Required fields are event, level, timestamp,
worker id and safe correlation ids. No SaaS sink is added. Operational health is
available through live/ready endpoints. Queue-depth dashboards and alerts are
deferred until VPS tooling is selected; the runbook records SQL checks operators
may perform with administrative credentials outside the worker.

## Migration and compatibility

The migration is expand-only: two nullable columns, one index and explicit
grants. Old web code ignores the columns and existing jobs remain valid. The
worker uses the updated schema only after the migration. The release workflow
applies it to Preview before any worker starts. The role remains NOLOGIN; login
provisioning stays out-of-band. No enum, foreign key, existing column or F1
business rule changes.

## Rollout

1. Merge code only after CI and local/ephemeral proof.
2. Apply migration to an isolated Preview database through `Database release`.
3. Verify columns, index and exact grants with read-only catalog queries.
4. Provision a dedicated login inheriting `ipe_worker_reader` and read-only R2
   credential outside Git.
5. Start one worker with no Phase H handler; readiness may be observed but it
   must not claim unsupported jobs.
6. Run the explicit smoke only against an isolated fixture database.
7. Future Phase H registers the real Places handler in a separate reviewed PR.

No rollout or deployment is performed by this task.

## Rollback

Stop the worker first. Because the migration is additive, application rollback
means returning to the prior web revision while leaving columns/index in place.
Revoke the worker login membership and R2 credential if compromise is suspected.
Use a fix-forward migration for schema/grant defects; do not edit an applied
migration or automatically drop the new columns. Neon branch/PITR remains the
last-resort recovery mechanism.

## Architecture decisions

| ADR | Decision | Status |
|---|---|---|
| `docs/adr/ADR-worker-queue-postgres.md` | Reuse owner-scoped PostgreSQL Places queue; no Redis or second queue. | Owner-approved, to be recorded as accepted with implementation. |

## Testability

The DB repository accepts a clock and exposes public claim/heartbeat/finalize
methods tested against PostgreSQL 16. Dispatcher, retry, config and logger are
pure or dependency-injected. Workdir tests use a dedicated temporary root and
assert filesystem results. R2 tests use a fake S3 sender and real streams.
Health receives an injected readiness probe. Runner tests use fake repository,
handler and clock except for one consolidated PostgreSQL smoke. Docker evidence
uses image inspection, container user/health and Compose port inspection.

## Requirement coverage

| Requirements | Design elements |
|---|---|
| FR-001, NFR-002, NFR-008 | Dedicated npm workspace, fail-fast typed configuration and secret-safe structured logger. |
| FR-002, FR-003, NFR-001 | Owner-scoped PostgreSQL claim transaction with `FOR UPDATE SKIP LOCKED`, lease recovery and a matching index. |
| FR-004, FR-005, FR-006, NFR-006 | Claimant-guarded heartbeat/finalization, registered dispatcher, bounded retry and graceful shutdown. |
| FR-007, NFR-003 | Per-job contained temporary workdir with guaranteed cleanup and a containment-safe janitor. |
| FR-008, NFR-004 | Separate GetObject-only R2 client, persisted VERIFIED key validation, streaming and byte bounds. |
| FR-009, FR-010, NFR-005 | Loopback live/ready server, injected DB probe and deterministic resource closure. |
| FR-011, FR-012, NFR-007 | Non-root hardened image, private Compose service and isolated noop smoke fixture only. |
| FR-013 | Operator, deployment, handoff and status documentation converged with the implementation evidence. |

## PR #39 review-fix design amendment

### Persisted media capability

Two designs were evaluated: validating a handler-provided media locator inside
the R2 adapter, or resolving a media id through an owner/post-scoped PostgreSQL
repository at download time. The first cannot establish authority because the
handler controls every asserted field. The selected design gives handlers only
`listVerified()` and `downloadToWorkdir(mediaId, workdir, signal)`. The latter
re-queries `post_media` for the claimed owner, post, `VERIFIED` state and non-null
key, then passes the returned canonical key to a private GetObject-only adapter.
Bucket, prefix and size policy remain configuration-owned.

### Graceful lifecycle and heartbeat

Immediate global abort was rejected because it converts an operator signal into
a handler failure. Stopping state now blocks polling and claims synchronously,
while a deadline-specific signal remains inactive during grace. The active
heartbeat uses a recursive one-shot timer scheduled only after the preceding
renewal settles. At the deadline, abort is sent once. The runner attempts a
guarded `WORKER_STOPPING` retry when the lease and database remain usable;
otherwise it performs no final state mutation and recovery uses lease expiry.

### Queue and operational corrections

Before every claim transaction, owner-scoped exhausted `PENDING` jobs and
expired exhausted `PROCESSING` jobs are terminalized without touching existing
terminal states or other owners. Smoke fixture setup uses one checked-out
`PoolClient`. Configuration validates the raw temp-root value before
normalization. The image healthcheck reads `WORKER_HEALTH_PORT` and retains the
8080 fallback; Compose continues to publish no port. These corrections require
no schema or grant change because the existing additive migrations already
provide the selected media columns and exact role privileges.
