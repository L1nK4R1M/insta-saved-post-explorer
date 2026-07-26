# Phase E Global Worker Foundation - Contracts

## API contracts

Internal HTTP only:

- `GET /health/live` returns `200` and `{ "status": "live" }` while the process
  event loop and health server are running.
- `GET /health/ready` returns `200` and `{ "status": "ready" }` when config is
  valid, shutdown has not started and `SELECT 1` succeeds within two seconds.
- Otherwise readiness returns `503` and `{ "status": "not_ready" }`.
- Other paths return `404`; non-GET methods return `405` with `Allow: GET`.
- No payload, job counts, environment values, commands or stack traces are exposed.

## Event and job contracts

Internal adapter shape:

```ts
type WorkerJob = {
  id: string;
  ownerId: string;
  type: "places.metadata";
  postId: string;
  payload: unknown;
  attempt: number;
  maxAttempts: number;
  claimedBy: string;
  leaseExpiresAt: Date;
};

type WorkerHandler<TPayload> = {
  type: WorkerJob["type"];
  parsePayload(input: unknown): TPayload;
  run(context: WorkerJobContext<TPayload>): Promise<WorkerJobResult>;
};
```

`payload` is derived from selected persisted fields; Phase E does not add a
payload column. Normal runtime claims only job types with registered real
handlers. The test-only registry may substitute noop for `places.metadata` only
against an ephemeral fixture database.

State transitions:

```text
PENDING -> PROCESSING -> SUCCEEDED
                      -> PENDING (retry scheduled)
                      -> FAILED
                      -> CANCELLED (external producer/admin only)
PROCESSING with expired lease -> PROCESSING by a new claimant
```

`NEEDS_REVIEW`, `SUCCEEDED`, `FAILED` and `CANCELLED` are not claimable.

## Data contracts

Add to `place_analysis_jobs`:

| Column | Type | Null | Meaning |
|---|---|---:|---|
| `claimed_at` | `TIMESTAMPTZ(3)` | yes | Time of the current/last atomic claim. |
| `next_attempt_at` | `TIMESTAMPTZ(3)` | yes | Earliest claim time for a pending retry. |

The claim index is designed for `owner_id`, status/availability, priority,
creation and id. All raw SQL is static and parameterized. Updates always write
`updated_at = now()` because Prisma's `@updatedAt` does not apply to raw SQL.

Required grants for `ipe_worker_reader` are explicit column-level `SELECT` on
safe job/post/media fields and `UPDATE` only on worker-owned queue state fields.
No `INSERT`, `DELETE`, sequence privilege, domain table write or media URL column
grant is permitted.

## UI contract

Not applicable. Phase E has no browser UI, dashboard or public endpoint.

## Configuration contract

| Variable | Required | Secret | Default | Validation | Owner |
|---|---|---|---|---|---|
| `WORKER_DATABASE_URL` | yes | yes | none | PostgreSQL URL; `DATABASE_URL` accepted only as local fallback. | Operator |
| `R2_ACCOUNT_ID` | yes | no | none | Cloudflare account identifier, safe segment. | Operator |
| `R2_ACCESS_KEY_ID` | yes | yes | none | Non-empty; injected from root `R2_WORKER_ACCESS_KEY_ID`. | Operator |
| `R2_SECRET_ACCESS_KEY` | yes | yes | none | Non-empty; injected from root `R2_WORKER_SECRET_ACCESS_KEY`. | Operator |
| `R2_BUCKET_NAME` | yes | no | none | Safe bucket name. | Operator |
| `MEDIA_PATH_PREFIX` | no | no | `originals` | Safe canonical key prefix. | Operator |
| `WORKER_ID` | yes | no | hostname-derived local default | 1..128 safe characters. | Runtime |
| `WORKER_OWNER_ID` | yes | no | none | Existing owner syntax, 1..128. | Owner |
| `WORKER_POLL_INTERVAL_MS` | no | no | `5000` | integer 100..300000. | Operator |
| `WORKER_LEASE_DURATION_MS` | no | no | `90000` | integer 1000..86400000. | Operator |
| `WORKER_HEARTBEAT_INTERVAL_MS` | no | no | `30000` | integer 100..lease/3. | Operator |
| `WORKER_MAX_ATTEMPTS` | no | no | `3` | integer 1..20; effective attempts also respect row limit. | Operator |
| `WORKER_TEMP_ROOT` | yes | no | none | Explicit absolute path, not filesystem root. | Operator |
| `WORKER_LOG_LEVEL` | no | no | `info` | `debug`, `info`, `warn`, `error`. | Operator |
| `WORKER_HEALTH_HOST` | no | no | `127.0.0.1` | IP literal; non-loopback requires explicit review. | Operator |
| `WORKER_HEALTH_PORT` | no | no | `8080` | integer 1..65535. | Operator |
| `WORKER_R2_MAX_BYTES` | no | no | `536870912` | integer 1 MiB..2 GiB. | Operator |
| `WORKER_SHUTDOWN_TIMEOUT_MS` | no | no | `30000` | integer 1000..300000. | Operator |
| `WORKER_JANITOR_MAX_AGE_MS` | no | no | `21600000` | integer >= lease, <= 7 days. | Operator |

## Feature flags

| Flag | Default | Scope | Removal condition | Rollback role |
|---|---|---|---|---|
| Real handler registration | disabled in Phase E | worker process | Enabled only by a future reviewed handler PR. | Prevent unsupported jobs from being claimed. |
| Foundation smoke registry | test harness only | ephemeral database | Removed or retained as test fixture after Phase H. | Never enabled in shared runtime. |

## Error catalog

| Code | Boundary | Meaning | Retryable | User-visible behavior | Telemetry |
|---|---|---|---|---|---|
| `WORKER_CONFIG_INVALID` | startup | Configuration is missing or inconsistent. | no | Process exits/not ready. | Field names only. |
| `WORKER_DB_UNAVAILABLE` | DB | Pool/query unavailable. | yes | Readiness 503. | Safe code and duration. |
| `WORKER_JOB_INVALID` | dispatcher | Unsupported type or invalid derived payload. | no | Job terminal when lease held. | IDs and safe issues only. |
| `WORKER_LEASE_LOST` | runtime | Claimant no longer owns a valid lease. | no for stale runner | Handler aborts; no finalization. | Warning event. |
| `WORKER_HANDLER_RETRYABLE` | handler | Safe transient failure. | yes | Pending with next attempt. | Stable handler code. |
| `WORKER_HANDLER_TERMINAL` | handler | Safe deterministic failure. | no | Failed. | Stable handler code. |
| `WORKER_R2_NOT_AUTHORIZED` | R2 | Media owner/post/key/state mismatch. | no | Failed. | No key or URL. |
| `WORKER_R2_TOO_LARGE` | R2 | Persisted or streamed size exceeds cap. | no | Failed and partial file removed. | Size category only. |
| `WORKER_R2_UNAVAILABLE` | R2 | Transient GetObject/stream failure. | yes | Retry policy applies. | Safe provider status. |
| `WORKER_WORKDIR_UNSAFE` | filesystem | Path or symlink violates containment. | no | Execution refused. | Relative opaque name only. |
| `WORKER_SHUTDOWN_TIMEOUT` | lifecycle | Current handler exceeded grace. | no | Abort and non-zero exit. | Duration and job id. |
| `WORKER_UNEXPECTED` | runtime | Unknown sanitized exception. | policy-dependent, default no | Failed when lease held. | No raw stack persisted. |

## Compatibility guarantees

- Existing application code and Phase F local workflow continue to compile and
  operate with nullable new columns.
- Existing job idempotency, enums, API DTOs and owner constraints do not change.
- Existing root npm commands keep their meanings; worker commands are additive.
- No public HTTP route, Vercel requirement or browser bundle is introduced.
- Production starts no worker until the additive migration and credentials are
  provisioned separately.
