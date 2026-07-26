# ADR: PostgreSQL queue for the global worker

**Status:** accepted  
**Date:** 2026-07-26

## Context

Phase E needs transactional claim, lease, heartbeat, bounded retry and crash
recovery for the single VPS worker. The repository already has an owner-scoped
`place_analysis_jobs` table and PostgreSQL operational tooling. Adding Redis or
a second job table would create a second source of truth before a second
asynchronous domain exists.

## Decision drivers

- Preserve one worker and one queue implementation.
- Reuse existing owner, idempotency and backup boundaries.
- Guarantee concurrent claim and stale-finalization safety.
- Avoid a new paid or operational service.
- Keep migration additive and reversible by stopping the worker.

## Options

| Option | Advantages | Disadvantages |
|---|---|---|
| Reuse `place_analysis_jobs` with PostgreSQL locking | Existing schema/ownership/operations; atomic claim; no new service. | Queue adapter remains Places-specific until another real domain exists. |
| Add generic `worker_jobs` | Clean generic envelope. | Second queue, duplicated production semantics and premature migration. |
| Redis/BullMQ | Mature queue ecosystem. | New service, credentials, persistence, backup, monitoring and failure mode. |

## Decision

Reuse `place_analysis_jobs`. Claim with one owner-scoped transaction using
`FOR UPDATE SKIP LOCKED`, store lease and retry availability in PostgreSQL, and
guard heartbeat/finalization by owner, claimant, status and unexpired lease. Add
only `claimed_at`, `next_attempt_at`, a supporting index and least-privilege
grants. Require `WORKER_OWNER_ID`. Do not add Redis or `worker_jobs`.

The Phase E noop handler is registered only by tests/smoke against an ephemeral
database. Normal runtime has no real handler until a later reviewed phase.

## Consequences

- Positive: one durable queue, atomic recovery, existing backup path and low VPS
  operational cost.
- Positive: owner isolation remains visible in every query and test.
- Negative: the adapter maps a Places-specific row to the internal handler
  contract; a future second domain must revisit the queue design.
- Negative: long handlers require reliable heartbeat and database availability.

## Reversal or supersession

Stop the worker to roll back application behavior; leave additive columns in
place. A future ADR may introduce a generic queue only after a second domain or
measured PostgreSQL limitation exists. Migration would then use
expand/migrate/contract and preserve in-flight job identity.
