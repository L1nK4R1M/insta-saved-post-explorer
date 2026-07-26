# Phase E Global Worker Foundation - Research and Evidence

## Research questions

| ID | Question | Why it matters | Status |
|---|---|---|---|
| RQ-001 | Can PostgreSQL safely carry Phase E without Redis? | Determines queue topology and operational cost. | Answered: yes. |
| RQ-002 | Can the existing Places table carry claim and retry? | Avoids a second queue and preserves F1. | Answered with two additive columns and an index. |
| RQ-003 | How is owner scope established before claim? | Prevents cross-owner selection. | Answered: required `WORKER_OWNER_ID`. |
| RQ-004 | How can noop smoke proof avoid corrupting real jobs? | A production noop would violate Places semantics. | Answered: ephemeral test-only registration. |
| RQ-005 | Which client boundary preserves least privilege? | Prisma exposes a broader generated surface than needed. | Answered: a small `pg` repository plus GetObject-only S3 adapter. |

## Evidence ledger

| Claim or decision | Source | Date checked | Confidence | Notes |
|---|---|---|---|---|
| Latest develop matches requested SHA | `git fetch`, `git rev-parse origin/develop` | 2026-07-26 | High | `f79320c819e94bfdd3b66539c1178d62a201afbf`. |
| Phase E entry gate is open | `docs/HANDOFF.md`, `docs/IMPLEMENTATION_STATUS.md` | 2026-07-26 | High | Phase C complete; Phase H blocked on E. |
| Existing queue has lease primitives | Prisma schema and F1 migration | 2026-07-26 | High | Missing only claim time and retry availability time for Phase E semantics. |
| No claim implementation exists | repository `git grep` for lease/skip locked | 2026-07-26 | High | Only schema/docs references found. |
| Restricted role exists and is tested | Phase C migration and `media-identity-postgres.test.ts` | 2026-07-26 | High | Current grants are read-only media identity only. |
| PostgreSQL tests are intentionally expensive and preserved | consolidated test change record | 2026-07-26 | High | Add only transactional and grant tests. |
| Clean unit baseline | `npm test` | 2026-07-26 | High | 319 passed, 129 DB tests skipped. |
| Docker local verification is presently unavailable | `docker version` | 2026-07-26 | High | Client installed, daemon not running. |

## Existing repository findings

- `src/server/places/jobs.ts` creates idempotent metadata jobs but does not claim
  or execute them asynchronously.
- `src/server/places/analysis.ts` finalizes local F2 work without lease guards;
  Phase E must not silently route this code through the noop foundation.
- The Phase F1 schema already has the minimal statuses and most lease fields.
- The existing owner-consistent composite constraints remain authoritative.
- Root `.env.example` distinguishes web upload credentials from
  `R2_WORKER_ACCESS_KEY_ID` and `R2_WORKER_SECRET_ACCESS_KEY`.
- No Docker or service-package convention exists, so a small npm workspace is
  the least invasive single-lock integration.

## Alternatives

| Option | Benefits | Costs | Risks | Fit with existing system |
|---|---|---|---|---|
| PostgreSQL adapter over `place_analysis_jobs` | Reuses schema, backup, ownership and operations; no paid service. | Additive columns/index/grants. | Requires careful type adapter and test-only smoke. | Best; owner-approved. |
| Add generic fields to `place_analysis_jobs` | Makes dispatcher type explicit. | Pollutes a Places-specific business contract. | F1/API compatibility drift. | Rejected. |
| Add `worker_jobs` | Clean generic queue model. | Second queue, migration and producer duplication. | Violates YAGNI and repository instruction. | Rejected. |
| Redis/BullMQ | Mature queue tooling. | New service, backup, auth and operational burden. | Added failure domain and cost without measured need. | Rejected. |
| Full Prisma client in worker | Existing dependency and generated types. | Broad API surface and less explicit transaction/column grants. | Accidental privilege expansion. | Rejected in favor of `pg`. |

## Selected approach

Use one npm-workspace worker with a narrow `pg` repository operating the
existing owner-scoped Places job table. Add only `claimed_at`,
`next_attempt_at`, a claim-supporting index and least-privilege grants. Treat
rows as the internal `places.metadata` job kind, but register no production
handler in Phase E. Tests may inject a noop handler against an ephemeral
PostgreSQL database to prove the foundation. Use a GetObject-only R2 adapter,
unique workdirs, local health server and non-root Docker service.

## Rejected approaches

Redis and a second table solve no demonstrated Phase E problem. Adding a generic
payload/type to the Places table would weaken an already-reviewed business
contract. Registering a production noop would be worse: it could mark real work
complete without performing analysis. These alternatives remain rejected unless
a second asynchronous domain or measured PostgreSQL limitation justifies a new
ADR.

## Remaining unknowns

- Exact Coolify, firewall, backup and alert-routing configuration is unknown but
  does not affect the local foundation contract; deployment remains unauthorized.
- Docker verification requires the local daemon or CI. This is a completion
  evidence dependency, not a design ambiguity.
- Package vulnerability remediation is outside Phase E unless the new direct
  dependency introduces an additional advisory.
