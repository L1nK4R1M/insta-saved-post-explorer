# Phase E Global Worker Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Multi-agent delegation is not enabled for this mission.

**Goal:** Build and prove the single owner-scoped PostgreSQL/R2 VPS worker foundation without implementing deep Places analysis, MCP, Hermes, Redis or deployment.

**Architecture:** Add `services/worker` as a private npm workspace. A narrow `pg` repository claims existing `place_analysis_jobs` rows transactionally, while a lease-aware runner supplies validated handlers with a contained workdir and GetObject-only R2 access. Normal runtime registers no Phase H handler; an ephemeral test registry supplies noop solely for smoke proof.

**Tech Stack:** Node.js 24, TypeScript 5.9, PostgreSQL 16, `pg` 8.22.0, Zod 4, AWS SDK S3, Vitest 4, Docker/Compose.

## Global Constraints

- Work only on `claude/phase-e-global-worker-foundation` from `develop@f79320c819e94bfdd3b66539c1178d62a201afbf`.
- Keep exactly one worker and reuse `place_analysis_jobs`; do not add Redis or `worker_jobs`.
- Require `WORKER_OWNER_ID`; every worker SQL statement binds it.
- Do not register noop in normal runtime or use smoke against a shared database.
- Do not implement Phase H, Phase J, Hermes, MCP, OCR, transcription, multimodal analysis or AI.
- Do not deploy or apply a production/hosted migration.
- Code comments must be English.
- Every production behavior follows RED, verified RED, minimal GREEN, verified GREEN, refactor.
- Preserve the existing risk-based test baseline; no browser E2E is required.

---

## File Structure

New worker files are organized by responsibility:

```text
services/worker/
├── package.json                  workspace identity and scripts
├── tsconfig.json                 NodeNext build contract
├── vitest.config.ts              worker-only tests
├── .env.example                  private runtime environment
├── .dockerignore
├── Dockerfile
├── docker-compose.yml
├── README.md
├── scripts/smoke.ts              ephemeral-only smoke entrypoint
├── src/
│   ├── index.ts                  composition and process lifecycle
│   ├── config.ts                 typed environment parser
│   ├── logger.ts                 redacted structured logger
│   ├── health/server.ts          live/ready HTTP contract
│   ├── db/client.ts              restricted pg pool
│   ├── db/jobs.ts                static owner-scoped state transitions
│   ├── r2/client.ts              verified GetObject streaming only
│   ├── runtime/dispatcher.ts     handler contract and registry
│   ├── runtime/heartbeat.ts      lease renewal loop
│   ├── runtime/retry.ts          deterministic retry classification
│   ├── runtime/runner.ts         one-job orchestration
│   ├── runtime/shutdown.ts       bounded stop controller
│   └── runtime/temp-workdir.ts   containment, cleanup and janitor
└── tests/
    ├── foundation.test.ts        config/logger/dispatcher/retry table cases
    ├── jobs-postgres.test.ts     transactions and exact grants
    ├── runtime.test.ts           lease loss, smoke and shutdown
    ├── io-security.test.ts       filesystem and R2 surface
    └── health.test.ts            HTTP readiness contract
```

## Task 1: Workspace, configuration and logger

**Files:**

- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `services/worker/package.json`
- Create: `services/worker/tsconfig.json`
- Create: `services/worker/vitest.config.ts`
- Create: `services/worker/src/config.ts`
- Create: `services/worker/src/logger.ts`
- Create: `services/worker/tests/foundation.test.ts`

**Interfaces:**

```ts
export type WorkerConfig = {
  databaseUrl: string;
  ownerId: string;
  workerId: string;
  pollIntervalMs: number;
  leaseDurationMs: number;
  heartbeatIntervalMs: number;
  maxAttempts: number;
  tempRoot: string;
  logLevel: "debug" | "info" | "warn" | "error";
  healthHost: string;
  healthPort: number;
  r2: { accountId: string; bucket: string; accessKeyId: string; secretAccessKey: string; maxBytes: number };
  shutdownTimeoutMs: number;
  janitorMaxAgeMs: number;
};

export function parseWorkerConfig(env: NodeJS.ProcessEnv): WorkerConfig;
export type WorkerLogger = { child(fields: SafeLogFields): WorkerLogger; debug/info/warn/error(event: string, fields?: SafeLogFields): void };
```

- [ ] **Step 1: Add workspace manifests and install the narrow driver**

Add `workspaces: ["services/worker"]` and additive scripts
`worker:test`, `worker:test:postgres`, `worker:typecheck`, `worker:build` and
`worker:smoke`. Create the private package named
`insta-post-explorer-worker`. Run:

```powershell
npm install --workspace services/worker pg@8.22.0
npm install --workspace services/worker --save-dev @types/pg@8.20.0
```

- [ ] **Step 2: Write failing configuration/logger tests**

Use `it.each` for invalid owner, interval, attempts, temp root, heartbeat/lease
relation and health host. Add a secret corpus and assert serialized log output
contains none of its values.

- [ ] **Step 3: Verify RED**

Run `npm run worker:test -- foundation.test.ts`. Expected: failure because
`parseWorkerConfig` and `createLogger` do not exist.

- [ ] **Step 4: Implement minimal typed config and redacted JSON logger**

Use strict Zod schemas, `path.resolve`, loopback default, bounded integer helpers
and key-based redaction. Never echo invalid values in Zod error formatting.

- [ ] **Step 5: Verify GREEN and static checks**

Run `npm run worker:test -- foundation.test.ts` and
`npm run worker:typecheck`. Expected: all focused cases pass with no warning.

- [ ] **Step 6: Commit the vertical slice**

```powershell
git add package.json package-lock.json services/worker
git commit -m "feat(worker): add typed workspace configuration"
```

## Task 2: Additive queue migration and transactional repository

**Files:**

- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260726XXXXXX_phase_e_worker_queue/migration.sql`
- Create: `services/worker/src/db/client.ts`
- Create: `services/worker/src/db/jobs.ts`
- Create: `services/worker/src/runtime/retry.ts`
- Create: `services/worker/tests/jobs-postgres.test.ts`
- Modify: `tests/unit/media-identity-postgres.test.ts`

**Interfaces:**

```ts
export type ClaimedJob = {
  id: string; ownerId: string; type: "places.metadata"; postId: string;
  payload: unknown; attempt: number; maxAttempts: number;
  claimedBy: string; leaseExpiresAt: Date;
};

export interface JobRepository {
  claimOne(input: ClaimInput): Promise<ClaimedJob | null>;
  heartbeat(input: LeaseIdentity): Promise<boolean>;
  succeed(input: LeaseIdentity, result: unknown): Promise<boolean>;
  retry(input: LeaseIdentity & RetryState): Promise<boolean>;
  fail(input: LeaseIdentity & SafeFailure): Promise<boolean>;
  ping(signal?: AbortSignal): Promise<void>;
  close(): Promise<void>;
}
```

- [ ] **Step 1: Write PostgreSQL RED tests**

Cover one winner from two simultaneous claim calls, expired/unexpired lease,
future retry date, wrong claimant heartbeat, lost-lease finalization, bounded
retry transition and owner B invisibility. Extend the role test to assert exact
allowed queue state updates and denial of inserts, deletes, payload/domain fields
and unrelated tables.

- [ ] **Step 2: Verify RED on PostgreSQL 16**

Run migrations on the ephemeral DB, then
`TEST_DATABASE_URL=<url> npm run worker:test:postgres`. Expected: schema and
repository assertions fail because columns/functions/grants are absent.

- [ ] **Step 3: Add the minimal additive migration**

Add Prisma fields:

```prisma
claimedAt     DateTime? @map("claimed_at") @db.Timestamptz(3)
nextAttemptAt DateTime? @map("next_attempt_at") @db.Timestamptz(3)
```

The SQL migration adds both nullable columns, a partial availability index and
explicit column-level grants to `ipe_worker_reader`. It does not alter existing
enums, foreign keys or idempotency indexes.

- [ ] **Step 4: Implement static parameterized repository SQL**

Use a transaction and `FOR UPDATE SKIP LOCKED`. Map only selected safe columns.
Every method receives the configured owner and includes it in SQL. Heartbeat,
success, retry and failure compare owner, id, claimant, status and unexpired
lease; return `rowCount === 1`.

- [ ] **Step 5: Implement deterministic retry math**

```ts
export function retryDelayMs(attempt: number, baseMs = 1_000, capMs = 300_000): number {
  return Math.min(capMs, baseMs * 2 ** Math.max(0, attempt - 1));
}
```

Clamp before persistence and use injected `now` in tests.

- [ ] **Step 6: Verify GREEN**

Reapply migrations on a fresh PostgreSQL 16 database and rerun the focused DB
suite plus `npm run db:generate` and `npm run worker:typecheck`.

- [ ] **Step 7: Commit the vertical slice**

```powershell
git add prisma services/worker/src/db services/worker/src/runtime/retry.ts services/worker/tests/jobs-postgres.test.ts tests/unit/media-identity-postgres.test.ts
git commit -m "feat(worker): add transactional job leasing"
```

## Task 3: Dispatcher, heartbeat, runner and shutdown

**Files:**

- Create: `services/worker/src/runtime/dispatcher.ts`
- Create: `services/worker/src/runtime/heartbeat.ts`
- Create: `services/worker/src/runtime/runner.ts`
- Create: `services/worker/src/runtime/shutdown.ts`
- Create: `services/worker/src/handlers/noop-handler.ts`
- Create: `services/worker/tests/runtime.test.ts`

**Interfaces:**

```ts
export type WorkerJobContext<T> = {
  jobId: string; ownerId: string; postId: string; payload: T;
  signal: AbortSignal; workdir: string; clients: AuthorizedClients;
  logger: WorkerLogger;
};

export type WorkerHandler<T> = {
  type: "places.metadata";
  parsePayload(input: unknown): T;
  run(context: WorkerJobContext<T>): Promise<{ result: unknown }>;
};
```

- [ ] **Step 1: Write failing runtime tests**

Consolidate unsupported type, invalid payload, successful dispatch, heartbeat
renewal, heartbeat loss abort, stale completion refusal, retryable/terminal
failure, max-attempt terminal behavior and no-claim-after-shutdown.

- [ ] **Step 2: Verify RED**

Run `npm run worker:test -- runtime.test.ts`. Expected: imports or behavior fail
because runtime modules are absent.

- [ ] **Step 3: Implement registry and test-only noop export**

`createProductionRegistry()` returns an empty registry in Phase E.
`createSmokeRegistry()` lives behind the smoke/test entrypoint and registers
noop; the normal `index.ts` cannot import it.

- [ ] **Step 4: Implement lease-aware execution**

Start heartbeat only after workdir creation. On false heartbeat, abort and mark
local lease-lost state. In `finally`, stop timers before cleanup. Call repository
finalization only if lease remains locally valid; still trust the DB boolean as
the authoritative guard.

- [ ] **Step 5: Implement shutdown controller**

Set `stopping` synchronously, expose an AbortSignal, race current work with the
deadline and close registered resources once. Avoid direct `process.exit` in
testable modules; the entrypoint sets `process.exitCode`.

- [ ] **Step 6: Verify GREEN and commit**

Run focused tests and worker typecheck, then commit:

```powershell
git add services/worker/src/runtime services/worker/src/handlers services/worker/tests/runtime.test.ts
git commit -m "feat(worker): run handlers with guarded leases"
```

## Task 4: Contained workdirs and GetObject-only R2

**Files:**

- Create: `services/worker/src/runtime/temp-workdir.ts`
- Create: `services/worker/src/r2/client.ts`
- Create: `services/worker/tests/io-security.test.ts`

**Interfaces:**

```ts
export interface TempWorkdirManager {
  create(jobId: string): Promise<string>;
  remove(path: string): Promise<void>;
  cleanupStale(now?: Date): Promise<number>;
}

export type AuthorizedMedia = {
  ownerId: string; postId: string; objectKey: string;
  byteSize: number; mimeType: string | null; identityState: "VERIFIED";
};

export interface ReadOnlyMediaClient {
  downloadToWorkdir(media: AuthorizedMedia, workdir: string, signal: AbortSignal): Promise<string>;
  close(): Promise<void>;
}
```

- [ ] **Step 1: Write filesystem and R2 RED tests**

Use a real temporary root and fake S3 `send`. Cover unique directory,
success/error cleanup, stale/recent janitor entries, traversal, outside path,
symlink/junction escape, owner/post mismatch, non-VERIFIED media, prefix mismatch,
oversized declared/streamed body, partial-file removal and absence of put/delete/list.

- [ ] **Step 2: Verify RED**

Run `npm run worker:test -- io-security.test.ts` and confirm missing-module or
expected-behavior failures.

- [ ] **Step 3: Implement containment and cleanup**

Resolve root once, reject filesystem roots, use opaque UUID directory names,
compare resolved paths with a trailing separator, inspect with `lstat`, and
unlink a directory link itself without following its target.

- [ ] **Step 4: Implement R2 reader**

Construct the endpoint from `R2_ACCOUNT_ID`; instantiate only `S3Client` and
`GetObjectCommand`. Validate persisted identity before request, stream through a
counting transform into a fixed file beneath workdir, and remove partial output
on all errors/abort.

- [ ] **Step 5: Verify GREEN and commit**

Run focused tests plus worker typecheck, then commit:

```powershell
git add services/worker/src/runtime/temp-workdir.ts services/worker/src/r2 services/worker/tests/io-security.test.ts
git commit -m "feat(worker): secure temporary media access"
```

## Task 5: Health server and executable lifecycle

**Files:**

- Create: `services/worker/src/health/server.ts`
- Create: `services/worker/src/index.ts`
- Create: `services/worker/tests/health.test.ts`
- Modify: `services/worker/tests/runtime.test.ts`

**Interfaces:**

```ts
export function createHealthServer(input: {
  host: string; port: number; isStopping: () => boolean;
  checkDatabase: (signal: AbortSignal) => Promise<void>;
}): { start(): Promise<void>; close(): Promise<void> };
```

- [ ] **Step 1: Write health/lifecycle RED tests**

Exercise live, ready, DB failure/timeout, 404, 405, secret-free body and resource
closure. Use port `0` in tests and injected readiness.

- [ ] **Step 2: Verify RED**

Run `npm run worker:test -- health.test.ts`.

- [ ] **Step 3: Implement sparse HTTP contract and composition root**

Use Node `http`, a two-second AbortSignal timeout and JSON responses containing
only `status`. Compose config, logger, pool, repository, registry, workdir, R2,
runner and signals in `index.ts`. If production registry is empty, stay ready but
do not issue claim queries for unsupported work.

- [ ] **Step 4: Verify GREEN and commit**

Run health/runtime tests, worker build and typecheck, then commit:

```powershell
git add services/worker/src/health services/worker/src/index.ts services/worker/tests
git commit -m "feat(worker): add health and graceful lifecycle"
```

## Task 6: Docker, Compose and ephemeral smoke

**Files:**

- Create: `services/worker/Dockerfile`
- Create: `services/worker/docker-compose.yml`
- Create: `services/worker/.dockerignore`
- Create: `services/worker/.env.example`
- Create: `services/worker/scripts/smoke.ts`
- Create: `services/worker/README.md`
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Write/check the container contract before implementation**

Add a focused test or validation script that fails while Docker/Compose files are
absent and later checks: multi-stage Node 24, numeric non-root user, healthcheck,
one service, `cap_drop: ALL`, `no-new-privileges`, no `ports`, and read-only R2
credential mapping.

- [ ] **Step 2: Verify RED**

Run the container-contract test. Expected: missing file assertions fail.

- [ ] **Step 3: Implement Docker and Compose**

Build from repository root so the single lockfile/workspace is available. Copy
only production workspace dependencies and compiled output into the final image.
Use an internal healthcheck against `127.0.0.1`; do not declare `EXPOSE` or
`ports`.

- [ ] **Step 4: Implement guarded smoke entrypoint**

Require `NODE_ENV=test`, a database name ending in `_test` or an explicit
`WORKER_SMOKE_CONFIRM=EPHEMERAL`, and the configured owner. Insert a valid fixture
post/job in a transaction, run the smoke registry once, assert terminal success,
then delete only fixture rows in `finally`.

- [ ] **Step 5: Verify local container gates**

```powershell
docker build -f services/worker/Dockerfile -t insta-post-explorer-worker:phase-e .
docker compose -f services/worker/docker-compose.yml config
docker compose -f services/worker/docker-compose.yml up -d --build
docker compose -f services/worker/docker-compose.yml ps
docker inspect insta-post-explorer-worker --format '{{.Config.User}} {{json .NetworkSettings.Ports}}'
npm run worker:smoke
docker compose -f services/worker/docker-compose.yml down
```

Expected: healthy, numeric non-root user, `{}`/no published ports, smoke success
and no remaining fixture workdir. If Docker is unavailable, record the block and
do not claim container readiness.

- [ ] **Step 6: Add CI worker gates and commit**

Keep browser E2E unchanged. Add worker typecheck/tests/PostgreSQL tests and Docker
build/contract proof to the existing quality job or a bounded dependent job.

```powershell
git add services/worker .github/workflows/ci.yml package.json package-lock.json
git commit -m "build(worker): add hardened container smoke"
```

## Task 7: Documentation and operational convergence

**Files:**

- Modify: `.env.example`
- Modify: `docs/deployment.md`
- Modify: `docs/operations.md`
- Modify: `docs/HANDOFF.md`
- Modify: `docs/IMPLEMENTATION_STATUS.md`
- Modify only if stale: `docs/CODEX_IMPLEMENTATION_ORDER.md`
- Modify: `docs/phase-e-global-worker-foundation.md`
- Modify: `docs/adr/ADR-worker-queue-postgres.md`
- Create: `docs/changes/2026-07-26-phase-e-global-worker-foundation.md`
- Modify: `specs/001-phase-e-global-worker-foundation/*`

- [ ] **Step 1: Update durable contracts to match actual code**

Document exact env mapping, grants, state transitions, claim SQL, retry,
shutdown, security, R2, workdir, Docker/Coolify contract and operational recovery.
Do not record planned commands as passed.

- [ ] **Step 2: Record real evidence and limitations**

Add command, exit code, test count and date. Explicitly state that VPS/Coolify,
firewall, backup, alerting and hosted migration were not run.

- [ ] **Step 3: Run document hygiene**

Run `git diff --check`, scan for secrets/private URLs, scan for Phase H/J terms in
production worker files, and update VibeSpec task/evidence statuses.

- [ ] **Step 4: Commit documentation**

```powershell
git add .env.example docs specs
git commit -m "docs(worker): record Phase E operations and evidence"
```

## Task 8: Full verification, two-pass review and PR

**Files:**

- Modify: `specs/001-phase-e-global-worker-foundation/06-validation.md`
- Modify: `specs/001-phase-e-global-worker-foundation/07-convergence.md`
- Modify: `specs/001-phase-e-global-worker-foundation/08-release.md`
- Generate: `specs/001-phase-e-global-worker-foundation/09-traceability.md`
- Add evidence logs under: `specs/001-phase-e-global-worker-foundation/evidence/`

- [ ] **Step 1: Run narrow and repository gates fresh**

```powershell
npm ci
npm run db:generate
npm run worker:typecheck
npm run worker:test
npm run lint
npm run typecheck
npm run test
npm run build
```

Run PostgreSQL, Docker, health, smoke, two-worker, expired-lease, cleanup,
non-root and no-port commands from the specification.

- [ ] **Step 2: Validate VibeSpec and generate traceability**

```powershell
python C:/Users/LinKarim/.agents/skills/vibespec-orchestrator/scripts/validate_feature.py --feature specs/001-phase-e-global-worker-foundation
python C:/Users/LinKarim/.agents/skills/vibespec-orchestrator/scripts/traceability.py --feature specs/001-phase-e-global-worker-foundation
```

Expected: zero validation errors and zero uncovered requirements.

- [ ] **Step 3: Perform specification-compliance review**

Read the request and all FR/NFR/BR items, then map each to diff and evidence.
Record any gap without discussing style. No PASS with an uncovered requirement.

- [ ] **Step 4: Perform fresh code-quality/security review**

Review static SQL, owner predicates, grants, lease races, stream aborts,
filesystem containment, logs, dependencies, Docker and test quality. No PASS with
a HIGH/BLOCKER finding.

- [ ] **Step 5: Record convergence and release gate**

Set `Decision: PASS`, `Release gate: READY` and feature status `done` only after
all evidence exists. Otherwise record the actual blocked/failed state.

- [ ] **Step 6: Commit final evidence**

```powershell
git add specs docs
git commit -m "test(worker): record Phase E verification"
```

- [ ] **Step 7: Push and open, but never merge, the PR**

```powershell
git push -u origin claude/phase-e-global-worker-foundation
gh pr create --base develop --head claude/phase-e-global-worker-foundation --title "feat(worker): Phase E global worker foundation" --body-file <prepared-pr-description>
```

Confirm the PR head SHA and checks. Do not merge and do not deploy.

## Self-Review

- Every FR/NFR is referenced by at least one task and acceptance scenario.
- Queue, owner scope, noop registration and environment names match the approved specification.
- The plan contains no production Phase H/J behavior or second queue.
- Tests are consolidated by risk and PostgreSQL/browser boundaries are not duplicated.
- File paths and public interfaces are consistent across tasks.
- Docker and hosted proof remain evidence gates rather than assumptions.

## Execution Handoff

After owner review of this plan and the accompanying Phase E specification,
execute inline with `superpowers:executing-plans`, one TDD slice at a time. Stop
again if the real code invalidates an approved contract, a destructive migration
becomes necessary, or a baseline test must be removed.
