# Phase E Global Worker Foundation - Validation

## Validation strategy

Use the cheapest seam that proves each risk. Pure suites cover configuration,
dispatcher, retry math, filesystem containment, R2 API surface, health and
lifecycle. PostgreSQL 16 covers only locking, expired leases, compare-and-set
guards and grants. One container smoke covers integration. No browser E2E is
added. Each production behavior is preceded by a focused failing test.

## Acceptance scenarios

### AT-001: Configuration relationships are enforced

References: FR-001, NFR-002, NFR-004. A table-driven test rejects absent owner,
non-positive polling, heartbeat greater than one third of lease, unbounded
attempts, implicit/root temp path and unsafe health host while accepting the
documented defaults without logging secrets.

### AT-002: Concurrent claim has exactly one winner

References: FR-002, FR-003, NFR-001, BR-002, BR-003. Two PostgreSQL transactions
claim the same eligible row concurrently; exactly one receives it and the row
contains one claimant, one incremented attempt and one lease.

### AT-003: An expired lease is reclaimed safely

References: FR-003, FR-004, BR-004. A `PROCESSING` row with an expired lease is
claimed by a new worker, while an unexpired lease and future `nextAttemptAt` are
not claimed.

### AT-004: Only the current claimant can heartbeat or finalize

References: FR-004, FR-006, BR-005. Wrong claimant and expired lease updates
affect zero rows; the runner maps that to lease loss, aborts the handler and does
not write success or failure.

### AT-005: Dispatcher rejects unsupported or invalid work

References: FR-005, FR-012. Consolidated cases prove unregistered type and
schema-invalid derived payload never invoke a handler; a registered valid fixture
receives the exact owner/job context and abort signal.

### AT-006: Retry is bounded and terminal

References: FR-006, NFR-004. Table-driven attempts prove deterministic capped
backoff, future availability, sanitized error persistence, terminal errors, and
transition to `FAILED` at the effective max attempt.

### AT-007: Workdir is removed after success and exception

References: FR-007, NFR-003. The real filesystem receives a generated job
directory; both a resolved and a thrown handler leave zero job directory after
the runner's cleanup promise resolves.

### AT-008: Janitor cannot escape the configured root

References: FR-007, NFR-003. Old direct children are removed, recent children
remain, traversal input is rejected, and a symlink/junction target outside root
is never followed or deleted.

### AT-009: Health readiness fails when PostgreSQL is unavailable

References: FR-009, NFR-005. Liveness stays sparse; an injected failing DB probe
returns readiness 503 within two seconds with no error detail or secret.

### AT-010: Restricted role and R2 client preserve least privilege

References: FR-002, FR-008, NFR-004, BR-007. PostgreSQL role tests permit only
the documented selected columns/queue transitions and deny unrelated tables,
media URL columns, inserts and deletes. The R2 adapter exposes GetObject only,
rejects owner/key/state mismatches and removes oversized partial downloads.

### AT-011: Graceful SIGTERM behavior is bounded

References: FR-010, FR-011, NFR-006, NFR-007. A lifecycle harness starts a job,
initiates shutdown, proves no later claim, stops heartbeat/janitor, aborts at the
deadline, cleans the workdir and closes resources. Container inspection proves a
numeric non-root user and zero published ports.

### AT-012: Foundation smoke claims and completes one job

References: FR-003, FR-005, FR-012. Against ephemeral PostgreSQL, test-only noop
registration claims a valid owner fixture, runs it, heartbeats when configured,
finalizes `SUCCEEDED`, and leaves no workdir. Normal registry construction does
not contain noop.

### AT-013: Documentation and traceability converge

References: FR-013, NFR-008. VibeSpec validation reports zero errors, generated
traceability has zero uncovered requirements, docs match the final diff and
evidence distinguishes local/CI proof from undeployed VPS work.

### AT-014: PostgreSQL is the media authorization source

References: FR-002, FR-005, FR-008, NFR-004, BR-007. A real PostgreSQL fixture
proves that only a `VERIFIED`, keyed media row matching the claimed owner and
post can cause GetObject. Foreign owner/post, `UNVERIFIED`, `REPAIRABLE` and
missing ids fail before R2. Handler-facing types expose no arbitrary key.

### AT-015: Shutdown provides a true grace period

References: FR-006, FR-010, NFR-006. Stopping blocks polls/claims immediately,
keeps heartbeat active, permits success before the deadline, sends abort only at
the deadline, and maps a cooperative deadline abort to guarded
`WORKER_STOPPING` retry or lease expiry, never `FAILED`.

### AT-016: Heartbeat is strictly sequential

References: FR-004, NFR-006. A renewal blocked longer than the interval proves
one request in flight, no overlap, next scheduling only after settlement,
`stop()` waiting for the active renewal, no restart and one lease-loss callback.

### AT-017: Smoke fixture transaction uses one connection

References: FR-003, FR-012. The transaction helper checks out one PoolClient,
runs BEGIN, fixture writes and COMMIT on it, rolls back on error and releases it;
the final cleanup may use the pool.

### AT-018: Effective-attempt exhaustion cannot strand pending jobs

References: FR-003, FR-006. PostgreSQL cases cover row and worker limits,
claimability below the limit, terminalization at the limit, complete stage,
safe code/timestamps/cleared lease fields and untouched other owners/states.

### AT-019: Temp root must be explicitly absolute

References: FR-001. Table-driven config cases reject empty, `./tmp`,
`tmp/worker` and filesystem root without echoing the value, while accepting and
normalizing an explicitly absolute non-root path.

### AT-020: Container healthcheck follows configuration

References: FR-011, NFR-007, BR-006. The built image is run with an internal
non-8080 health port and reaches healthy without publishing a port; runtime
inspection still reports numeric non-root user and empty port bindings.

## Quality commands

Narrow first:

```text
npm run worker:test -- --run <focused file or test name>
TEST_DATABASE_URL=<ephemeral> npm run worker:test:postgres
npm run worker:typecheck
```

Repository gates:

```text
npm ci
npm run db:generate
npm run lint
npm run typecheck
npm run test
npm run build
```

Container and smoke gates:

```text
docker build -f services/worker/Dockerfile -t insta-post-explorer-worker:phase-e .
docker compose -f services/worker/docker-compose.yml config
docker compose -f services/worker/docker-compose.yml up -d --build
docker inspect <container> --format <user-and-health-fields>
npm run worker:smoke
docker compose -f services/worker/docker-compose.yml down
```

VibeSpec gates:

```text
python <vibespec>/validate_feature.py --feature specs/001-phase-e-global-worker-foundation
python <vibespec>/traceability.py --feature specs/001-phase-e-global-worker-foundation
git diff --check
```

## Evidence ledger

| Evidence ID | Claim | Planned source | Status |
|---|---|---|---|
| EV-001 | Workspace/config/logger contracts | Focused unit output and typecheck | Local pass: 9 tests plus typecheck, 2026-07-26 |
| EV-002 | Migration, claim, lease, retry and grants | PostgreSQL 16 test output and catalog queries | Local pass: 9 queue + 6 role/media tests on `_test`, 2026-07-26 |
| EV-003 | Dispatcher/runner/heartbeat/shutdown | Focused runtime test output | Local pass: 13 tests, 2026-07-26 |
| EV-004 | Cleanup and R2 least privilege | Filesystem/R2 contract tests | Local pass: 11 tests, 2026-07-26 |
| EV-005 | Health and lifecycle integration | Health/lifecycle test output | Local pass: 18 health/runtime tests, 2026-07-26 |
| EV-006 | Docker and smoke gates | Build, Compose, inspect and smoke logs | Local pass: image, Compose, smoke, `10001:10001`, `{}`, healthy, 2026-07-26 |
| EV-007 | Documentation convergence | Diff and document review | Local pass: documents aligned and diff hygiene clean, 2026-07-26 |
| EV-008 | Original completion evidence | Quality gates, traceability and two reviews | Superseded by owner review on head `7c202c32f2d5ecb7e2c4155d0fe5032a62403826` |
| EV-009 | Persisted media authorization | PostgreSQL/R2 regression output and grant proof | PASS: worker PostgreSQL 11/11 plus restricted-role root suite, 2026-07-26 |
| EV-010 | Graceful shutdown and sequential heartbeat | Deterministic lifecycle/slow-heartbeat tests | PASS: worker suite 59/59 with DB, including 18 runtime scenarios, 2026-07-26 |
| EV-011 | Targeted queue/config/smoke/container corrections | PostgreSQL, config, transaction and non-8080 container proof | PASS: smoke passed; image healthy at port 8181 as `10001:10001` with `ports={}`, 2026-07-26 |
| EV-012 | Review-fix completion | Full requested gates, two reviews, updated PR and CI | Local gates PASS; independent reviews, push and refreshed PR CI pending |
