# Phase E Global Worker Foundation - Specification

## Problem

The application can create owner-scoped Places analysis jobs and persist
authoritative R2 media identity, but no reusable VPS process can safely claim,
lease, retry or clean up those jobs. Phase H cannot start until this operational
foundation exists and is proven without introducing a second queue or a Places
microservice.

## Outcome

One TypeScript worker process under `services/worker` safely operates the
existing PostgreSQL queue for one configured owner, exposes internal health,
streams authorized R2 objects into bounded temporary workdirs, and terminates
cleanly. Its transactional, security, cleanup and container invariants are
supported by fresh evidence.

## Goals

- Reuse PostgreSQL and `place_analysis_jobs` with no Redis or second queue.
- Make claim, lease, retry and finalization safe under concurrency and crashes.
- Preserve least-privilege owner and media boundaries.
- Provide a small handler contract ready for a future Phase H Places handler.
- Produce a non-root, internally observable Docker service with guaranteed
  temporary-file cleanup.

## Non-goals

- Phase H media analysis, FFmpeg, OCR, transcription, AI or multimodal work.
- Phase J, Hermes, MCP or any direct MCP/Hermes database access.
- A generic multi-domain queue table, a second worker or a Places microservice.
- Production VPS deployment, public endpoints, SaaS observability or Redis.
- Changing the existing local Phase F caption-analysis business rules.

## Users and permissions

- The application remains the job producer and uses its existing credentials.
- The worker process consumes jobs only for required `WORKER_OWNER_ID`.
- The worker database login inherits `ipe_worker_reader`; grants are limited to
  required queue operations and selected post/media identity columns.
- The worker R2 credential is read-only and scoped to the configured bucket and
  media prefix.
- Operators may read liveness/readiness locally or through an internal container
  healthcheck; there is no command endpoint.

## User stories

- US-001: As the owner, I can run one global worker that never processes another owner's job.
- US-002: As an operator, I can detect whether the worker process is alive and whether PostgreSQL is reachable without exposing secrets.
- US-003: As a future handler author, I receive a validated payload, cancellation signal, isolated workdir, authorized clients and contextual logger.
- US-004: As an operator recovering from a crash, I can let an expired lease be reclaimed without manually editing the database.

## Functional requirements

- FR-001: The worker validates all required configuration before opening the polling loop, including a non-empty owner, positive poll interval, bounded attempts, a raw `WORKER_TEMP_ROOT` value that is explicitly absolute and not the filesystem root, local health host by default, and heartbeat strictly shorter than lease duration.
- FR-002: Every worker SQL statement that reads or mutates a job, post or media row binds `WORKER_OWNER_ID`; a row without a valid owner is never claimed.
- FR-003: A transaction claims zero or one eligible job with `FOR UPDATE SKIP LOCKED` or an equivalent PostgreSQL-safe mechanism, ignores future `nextAttemptAt`, reclaims expired `PROCESSING` leases, assigns the claimant, records claim/lease times and increments attempts atomically.
- FR-004: Heartbeat renewal succeeds only for the current claimant while the lease remains valid; renewals are strictly sequential with at most one request in flight, and loss of lease cancels execution exactly once and prevents success, retry or terminal finalization by the stale claimant.
- FR-005: The dispatcher accepts only registered job kinds and schema-valid payloads and supplies job id, owner id, abort signal, workdir, authorized clients and contextual logger to the handler.
- FR-006: Retryable failures return the job to `PENDING` with deterministic capped exponential backoff and `nextAttemptAt`; terminal failures and both `PENDING` or expired-lease `PROCESSING` jobs at the effective attempt limit transition to `FAILED` with bounded, sanitized error fields. A shutdown-timeout abort is never a terminal business failure: it schedules a bounded `WORKER_STOPPING` retry while the lease is still held, or performs no finalization so the lease can expire.
- FR-007: Each execution receives a unique workdir beneath `WORKER_TEMP_ROOT`; it is removed in `finally` after success, failure or cancellation, and startup plus periodic janitor cleanup never delete outside the configured root or follow an escaping symlink.
- FR-008: The handler receives a job-scoped media capability exposing only safe media references and media-id downloads. Every download re-queries PostgreSQL for that media id under the claimed owner and post with `identity_state = 'VERIFIED'` and a non-null canonical key; only that persisted key may reach read-only `GetObject`. The capability enforces the configured bucket, prefix and maximum byte size and exposes no key input, put, delete, arbitrary URL or general object-list operation.
- FR-009: `/health/live` reports process liveness and `/health/ready` reports configuration plus database connectivity; responses contain no job payload, database URL, credential or detailed internal metrics.
- FR-010: SIGTERM and SIGINT synchronously enter stopping state, stop polling and refuse new claims while the current handler and heartbeat continue during the configured grace period. The shutdown abort signal fires only after the deadline; its retry-or-expire policy is distinct from lease loss and handler business failure. Timers and resources then close, and the process reports non-zero only when the grace deadline was exceeded.
- FR-011: The worker ships as a multi-stage Docker image running as a non-root user with an internal healthcheck that reads `WORKER_HEALTH_PORT` with an `8080` fallback, one Compose service, no published port, dropped capabilities and no-new-privileges.
- FR-012: An explicit ephemeral smoke path proves claim, execution, heartbeat-capable runtime, success, retry, terminal failure and cleanup without registering a noop handler in normal runtime or completing a real shared Places job.
- FR-013: Phase E updates worker, deployment, operations, handoff, status, ADR, change and VibeSpec documentation with recorded commands, results, limits, rollout and rollback.

## Non-functional requirements

- NFR-001: Two concurrent claim transactions against the same eligible row produce exactly one winner in PostgreSQL 16.
- NFR-002: Default heartbeat is at most one third of the default lease duration; all duration inputs are finite integer milliseconds bounded from 100 ms to 24 hours according to their contract.
- NFR-003: Successful, exceptional and cancelled executions leave zero job workdirs after the cleanup promise resolves; startup janitor removes only entries older than six hours by default.
- NFR-004: Stored errors and structured logs are bounded to 1,024 characters per message field and contain none of the configured database/R2 secrets in the test corpus.
- NFR-005: Health endpoints respond within 2 seconds locally when dependencies respond; readiness returns non-2xx within the same bound when PostgreSQL is unavailable.
- NFR-006: Graceful shutdown defaults to 30 seconds, permits the active handler to finish successfully with heartbeat renewal during that interval, sends no abort before the deadline, and accepts no new claim after stopping begins.
- NFR-007: The image declares a numeric non-root user, and Compose publishes zero host ports.
- NFR-008: Tests remain risk-based: PostgreSQL is used only for transactional/grant invariants, while pure config, retry, dispatcher, cleanup and health behavior use consolidated table-driven suites.

## Business rules and invariants

- BR-001: There is exactly one global worker service and one persistent queue implementation.
- BR-002: `place_analysis_jobs` remains the queue; Phase E adds no `worker_jobs` table.
- BR-003: `WORKER_OWNER_ID` is required and cannot be inferred from an arbitrary claimed row.
- BR-004: `leaseOwner` is the claimant identity; `PENDING` includes initial and retry-wait jobs; `PROCESSING` means an active or expired lease; `FAILED`, `SUCCEEDED`, `NEEDS_REVIEW` and `CANCELLED` are terminal for Phase E claiming.
- BR-005: A stale claimant cannot mutate final state even if its handler later resolves.
- BR-006: No worker health port is publicly published and no command endpoint exists.
- BR-007: Worker R2 credentials are distinct from web upload credentials.

## Failure and edge-case behavior

| Condition | Expected behavior | User-visible result | Recovery |
|---|---|---|---|
| Invalid configuration | Process exits before polling and logs safe field names only. | Not ready. | Correct environment and restart. |
| No eligible job | Poll loop waits the configured interval. | Ready and idle. | None. |
| Concurrent claim | One transaction wins; others receive no job. | No duplicate execution. | Next poll. |
| Lease expires | Another worker may reclaim atomically. | Original handler is cancelled and cannot finalize. | New claimant completes or retries. |
| Retryable handler error | Job returns to `PENDING` with future `nextAttemptAt`. | Safe error code in DB/logs. | Automatic retry. |
| Terminal/exhausted error | Job becomes `FAILED`. | Safe terminal code. | Operator creates a new idempotent input/version when appropriate. |
| R2 key/owner mismatch | Download is refused before network transfer. | Terminal security error. | Repair persisted identity/ownership. |
| DB unavailable | Readiness fails and polling backs off without claiming. | `/health/ready` non-2xx. | Restore DB and worker self-recovers. |
| Shutdown begins and work completes within grace | Polling stops, heartbeat continues and success may be persisted. | Clean zero exit. | None. |
| Shutdown timeout with lease held | Abort signal fires only at the deadline; a guarded `WORKER_STOPPING` retry is attempted and cleanup runs. | Non-zero exit. | Another poll may retry later. |
| Shutdown timeout without usable lease/DB | No business failure is persisted and cleanup proceeds; the lease is left to expire. | Non-zero exit. | Another worker reclaims the expired lease. |

## Data and privacy requirements

The worker reads job identifiers, owner identifiers, selected post theme fields
and authoritative media metadata. Media bytes exist only inside a per-job
workdir for the duration of that job and are never uploaded or retained by Phase
E. Logs exclude captions, payload bodies, object URLs, database URLs and secret
values. Database errors are mapped to stable codes before persistence.

## Dependencies and constraints

- Node.js `>=24 <25`, TypeScript strict, PostgreSQL 16, existing AWS SDK and Zod.
- Add the narrow `pg` driver rather than importing the full Prisma client into
  the worker.
- Preserve existing Next.js scripts and consolidated tests.
- Schema changes are additive and released through the protected migration
  workflow; no production migration is authorized in this task.
- The worker uses a dedicated npm workspace and the repository's single lockfile.
- Code comments are English.

## Acceptance summary

The change is acceptable only when PostgreSQL concurrency, expired-lease
recovery, claimant-only heartbeat, stale-finalization refusal and restricted
grants are proven; success/error cleanup leaves no files; the smoke job finishes;
shutdown, health and Docker invariants are evidenced; and all repository quality
gates pass with traceability and independent review.

## Unresolved decisions

None for implementation. VPS credentials, firewall application, backup drills,
alert recipients and actual Coolify deployment remain explicitly unverified and
require later operator authorization.

## Change-control note

Changes to queue semantics, owner scope, grants, R2 permissions, handler
registration or cleanup policy must update this specification and receive owner
review before the feature can receive a final PASS.
