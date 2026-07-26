# ADR-001: Reuse the owner-scoped PostgreSQL Places queue

**Status:** accepted  
**Date:** 2026-07-26

## Context

Phase E needs safe asynchronous execution, while the repository already owns an
owner-scoped Places job table and explicitly forbids a second queue without a
second real asynchronous domain.

## Decision drivers

- One global worker and one queue implementation.
- Transactional claim, lease recovery and guarded finalization.
- Least privilege and explicit owner scope.
- No additional paid or operational service.

## Options

| Option | Advantages | Disadvantages |
|---|---|---|
| Reuse `place_analysis_jobs` | Existing ownership, idempotency and operations. | Adapter remains Places-specific. |
| Add `worker_jobs` | Generic envelope. | Premature second queue and migration. |
| Redis/BullMQ | Familiar queue API. | New service, persistence and security boundary. |

## Decision

Reuse `place_analysis_jobs` with required `WORKER_OWNER_ID`, PostgreSQL
`FOR UPDATE SKIP LOCKED`, database-backed leases/retries and guarded updates.
Add only `claimed_at`, `next_attempt_at`, one index and exact grants. Register
noop only in ephemeral tests/smoke, never in normal runtime.

The durable repository ADR is `docs/adr/ADR-worker-queue-postgres.md`.

## Consequences

- Positive: no new queue service or source of truth.
- Positive: concurrency and recovery stay transactional with job state.
- Negative: a future second domain must revisit the envelope through a new ADR.

## Reversal or supersession

Stop the worker for behavioral rollback and leave additive columns in place.
Supersede only after a second domain or measured PostgreSQL limitation exists.
