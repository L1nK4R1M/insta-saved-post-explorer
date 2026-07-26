# Phase E Global Worker Foundation - Tasks

## Task rules

- Implement every behavior through red-green-refactor; configuration-only and
  generated Prisma client changes are the documented exceptions.
- Keep PostgreSQL tests only for transaction, recovery and grant guarantees.
- Use English code comments and preserve unrelated files.
- Record fresh evidence before marking a task complete.
- Do not commit, deploy or apply a remote migration during an implementation task.

## Phase 1 - Foundations

- [x] TASK-001: Establish the worker workspace, typed configuration and safe logger
  - Requirements: FR-001, FR-005, NFR-002, NFR-004, NFR-008
  - Dependencies: None
  - Files: `package.json`, `package-lock.json`, `services/worker/package.json`, `services/worker/tsconfig.json`, `services/worker/src/config.ts`, `services/worker/src/logger.ts`, `services/worker/tests/foundation.test.ts`
  - Tests: AT-001, AT-005, AT-012
  - Evidence: EV-001
  - Done: Invalid relations fail before startup, secrets are redacted, the workspace typechecks, and focused tests pass after an observed RED.

- [x] TASK-002: Deliver owner-scoped transactional queue semantics and least-privilege migration
  - Requirements: FR-002, FR-003, FR-004, FR-006, NFR-001, NFR-004, BR-002, BR-003, BR-004, BR-005
  - Dependencies: TASK-001
  - Files: `prisma/schema.prisma`, `prisma/migrations/20260726*_phase_e_worker_queue/migration.sql`, `services/worker/src/db/client.ts`, `services/worker/src/db/jobs.ts`, `services/worker/src/runtime/retry.ts`, `services/worker/tests/jobs-postgres.test.ts`, `tests/unit/media-identity-postgres.test.ts`
  - Tests: AT-002, AT-003, AT-004, AT-006, AT-010
  - Evidence: EV-002
  - Done: The additive migration applies on PostgreSQL 16, concurrent claim has one winner, expired lease is reclaimed, claimant guards hold, retry is bounded, and exact role grants pass.

## Phase 2 - Core implementation

- [x] TASK-003: Execute registered handlers with lease-aware dispatcher and runner
  - Requirements: FR-004, FR-005, FR-006, FR-012, NFR-006, NFR-008
  - Dependencies: TASK-002
  - Files: `services/worker/src/runtime/dispatcher.ts`, `services/worker/src/runtime/runner.ts`, `services/worker/src/runtime/heartbeat.ts`, `services/worker/src/runtime/shutdown.ts`, `services/worker/src/handlers/noop-handler.ts`, `services/worker/tests/runtime.test.ts`
  - Tests: AT-004, AT-005, AT-006, AT-009, AT-011
  - Evidence: EV-003
  - Done: Unsupported/invalid jobs fail safely, heartbeat loss aborts and blocks finalization, retry/terminal paths are guarded, and shutdown refuses new claims.

- [x] TASK-004: Guarantee contained temporary storage and read-only media streaming
  - Requirements: FR-007, FR-008, NFR-003, NFR-004
  - Dependencies: TASK-002
  - Files: `services/worker/src/runtime/temp-workdir.ts`, `services/worker/src/r2/client.ts`, `services/worker/tests/io-security.test.ts`
  - Tests: AT-007, AT-008, AT-010
  - Evidence: EV-004
  - Done: Success/error/cancellation remove all job directories, janitor cannot escape root, and R2 exposes only owner-validated bounded GetObject streaming.

## Phase 3 - Integration and hardening

- [x] TASK-005: Integrate lifecycle, health and executable entrypoint
  - Requirements: FR-001, FR-009, FR-010, NFR-005, NFR-006
  - Dependencies: TASK-003, TASK-004
  - Files: `services/worker/src/health/server.ts`, `services/worker/src/index.ts`, `services/worker/tests/health.test.ts`, `services/worker/tests/runtime.test.ts`
  - Tests: AT-009, AT-011, AT-012
  - Evidence: EV-005
  - Done: Live/ready contracts, unavailable-DB behavior, timer/resource closure and bounded SIGTERM flow pass focused tests.

- [x] TASK-006: Prove the worker in a hardened container and ephemeral smoke environment
  - Requirements: FR-011, FR-012, NFR-007, BR-001, BR-006, BR-007
  - Dependencies: TASK-005
  - Files: `services/worker/Dockerfile`, `services/worker/docker-compose.yml`, `services/worker/.dockerignore`, `services/worker/.env.example`, `services/worker/scripts/smoke.ts`, `.github/workflows/ci.yml`
  - Tests: AT-002, AT-003, AT-007, AT-008, AT-009, AT-011
  - Evidence: EV-006
  - Done: Image builds, container is non-root/healthy, Compose publishes no port, and one ephemeral smoke job is claimed and completed with no remaining workdir.

- [x] TASK-007: Converge operational and repository documentation
  - Requirements: FR-013, NFR-008
  - Dependencies: TASK-006
  - Files: `.env.example`, `docs/phase-e-global-worker-foundation.md`, `docs/deployment.md`, `docs/operations.md`, `docs/adr/ADR-worker-queue-postgres.md`, `docs/changes/2026-07-26-phase-e-global-worker-foundation.md`, `docs/HANDOFF.md`, `docs/IMPLEMENTATION_STATUS.md`, `docs/CODEX_IMPLEMENTATION_ORDER.md`, `specs/001-phase-e-global-worker-foundation/*`
  - Tests: AT-013
  - Evidence: EV-007
  - Done: Durable docs match implemented contracts, explicitly separate local proof from undeployed VPS work, and record exact commands/results.

## Phase 4 - Release readiness

- [x] TASK-008: Complete quality gates, independent reviews, traceability and PR handoff
  - Requirements: FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, FR-007, FR-008, FR-009, FR-010, FR-011, FR-012, FR-013, NFR-001, NFR-002, NFR-003, NFR-004, NFR-005, NFR-006, NFR-007, NFR-008
  - Dependencies: TASK-007
  - Files: Entire Phase E diff; `specs/001-phase-e-global-worker-foundation/06-validation.md`, `07-convergence.md`, `08-release.md`, `09-traceability.md`, `evidence/*`
  - Tests: AT-001, AT-002, AT-003, AT-004, AT-005, AT-006, AT-007, AT-008, AT-009, AT-010, AT-011, AT-012, AT-013
  - Evidence: EV-008
  - Done: All required commands have fresh results, no uncovered requirement or HIGH/BLOCKER finding remains, convergence is PASS, release gate is READY, and a non-merged PR targets `develop`.

## Dependency graph

```text
TASK-001 -> TASK-002 -> TASK-003
                    -> TASK-004
TASK-003 + TASK-004 -> TASK-005 -> TASK-006 -> TASK-007 -> TASK-008
```

TASK-003 and TASK-004 may proceed only after the shared data/config contracts in
TASK-002 are stable. All later tasks depend on their public interfaces.
