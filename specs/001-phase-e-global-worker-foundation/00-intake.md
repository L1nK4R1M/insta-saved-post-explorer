# Phase E Global Worker Foundation - Intake

Feature: 001  
Mode: critical  
Created: 2026-07-26

## Original request

Add the single reusable VPS worker foundation at `services/worker`, named
`insta-post-explorer-worker`, on a dedicated branch from the latest `develop`.
Reuse PostgreSQL and the existing owner-scoped Places job structure, use a
restricted database role and read-only R2 credentials, guarantee transactional
claim/lease/retry/cleanup, expose internal-only health checks, ship a non-root
Docker image, and stop before Phase H, Phase J, Hermes, MCP, OCR, transcription,
or multimodal work. Tests must be risk-based and code comments must be English.

## Desired outcome

A locally verifiable worker process can claim and finish one owner-scoped smoke
job, safely recover an expired lease, refuse stale finalization, clean all job
workdirs, and run in Docker without a published port or root privileges. No
deployment is authorized by this change.

## Existing-system evidence

| Evidence | Path or source | Relevance |
|---|---|---|
| Phase E is the next executable infrastructure phase | `docs/HANDOFF.md`, `docs/IMPLEMENTATION_STATUS.md` | Entry gate is open; Phase H remains blocked. |
| One global worker and PostgreSQL queue are mandated | `AGENTS.md`, `docs/CODEX_IMPLEMENTATION_ORDER.md` | Prohibits a Places microservice and Redis by default. |
| Existing reusable queue | `prisma/schema.prisma`, `src/server/places/jobs.ts` | `place_analysis_jobs` already carries owner, status, attempts and lease fields. |
| Restricted role and R2 identity | Phase C migration and `docs/CODEX_R2_WORKER_ISOLATION_DESIGN.md` | Reuse `ipe_worker_reader`, canonical object keys and separate read-only credentials. |
| Owner-consistent database constraints | Phase F1 migration | Composite keys prevent cross-owner post/job/place relations. |
| Existing provider retry is not job retry | `src/server/places/resolvers/geoapify.ts` | Reuse concepts, not the provider-specific implementation. |
| Baseline on reference commit | `npm test` on `f79320c` | 43 files passed, 319 tests passed, 129 PostgreSQL tests skipped without a DB. |

## Brownfield baseline

- Reference revision: `origin/develop` at `f79320c819e94bfdd3b66539c1178d62a201afbf`.
- Isolated branch: `claude/phase-e-global-worker-foundation`.
- No existing `services/worker`, worker Dockerfile, worker Compose file, or
  transactional claim implementation.
- `PlaceAnalysisJob` is the only suitable persistent queue. `ImportJob` and
  `SyncJob` are progress ledgers rather than claimable work queues.
- Existing queue fields include `ownerId`, `attemptCount`, `maxAttempts`,
  `leaseOwner`, `leaseExpiresAt`, `heartbeatAt`, bounded error fields and
  terminal timestamps. It lacks `claimedAt` and `nextAttemptAt`.
- `ipe_worker_reader` currently has column-level `SELECT` only on authoritative
  `post_media` identity columns. Phase E must extend this role minimally.
- Docker CLI exists locally, but the Docker daemon was unavailable during
  discovery. Docker evidence remains a completion gate, not an assumed result.

## Assumptions

| ID | Assumption | Evidence | Risk if wrong | Resolution |
|---|---|---|---|---|
| ASM-001 | Phase E remains single-owner per worker process. | Phase C decision D2 and owner approval on 2026-07-26. | An unscoped worker could cross tenant boundaries. | Require `WORKER_OWNER_ID` and bind it in every SQL statement. |
| ASM-002 | `place_analysis_jobs` remains the only persistent queue. | `AGENTS.md` and owner-approved preflight option 1. | A second queue would duplicate scheduling and drift. | Adapt the existing table; do not add `worker_jobs`. |
| ASM-003 | Foundation smoke execution uses only an ephemeral test database. | Owner-approved preflight option 1. | A noop could falsely complete a real Places job. | Do not register noop in normal runtime; fail closed without a real handler. |
| ASM-004 | The root repository can become a small npm workspace without changing web behavior. | One repository and one lockfile are required; no current workspace exists. | Install/build tooling could regress. | Keep root scripts compatible and verify existing lint, tests and build. |

## Open questions

No material product, security or architecture question remains open. VPS
credentials, firewall policy, backup ownership and production alert routing are
release prerequisites outside this non-deployment pull request.

## Risk classification

| Risk factor | Score | Rationale |
|---|---:|---|
| Authorization, secrets and privacy | 3 | Restricted PostgreSQL and R2 credentials cross a new runtime boundary. |
| Persisted schema and compatibility | 2 | Additive queue columns, indexes and grants are required. |
| Distributed state and concurrency | 2 | Claim, leases, heartbeat, retry and crash recovery must be race-safe. |
| Infrastructure and operations | 2 | Docker, health, shutdown and VPS compatibility are introduced. |
| More than five modules | 1 | Database, runtime, R2, filesystem, health, Docker, tests and docs change. |

Total score: 10  
Selected mode: critical

## Scope routing decision

Critical mode is required because a lost lease, over-broad grant, path escape,
or duplicate claim could corrupt persistent state or expose another owner's
media. The workflow therefore requires explicit contracts, threat modeling,
additive migration and rollback planning, TDD at transactional seams, complete
traceability, separate specification and quality reviews, and a final release
gate before the pull request can be called ready.
