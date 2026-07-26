# Global worker foundation

This private Node.js workspace contains the Phase E worker foundation. Its
normal production registry is intentionally empty until a separately reviewed
Places handler is delivered. It does not expose a public API or a command
surface.

Use `npm run worker:test`, `npm run worker:typecheck` and
`npm run worker:build` from the repository root. PostgreSQL integration tests
require `TEST_DATABASE_URL` pointing to an ephemeral PostgreSQL 16 database.
The smoke command additionally requires `NODE_ENV=test` and a database whose
name ends in `_test`, unless `WORKER_SMOKE_CONFIRM=EPHEMERAL` is set explicitly.

The Compose service publishes no host port. Health endpoints are available only
inside the container at `127.0.0.1:$WORKER_HEALTH_PORT` (default `8080`), and the
image healthcheck uses the same configured port.

Handlers never receive an R2 key or a general-purpose S3 client. Their
job-scoped media capability can list persisted `VERIFIED` media references and
download one by media id; the repository re-authorizes owner, post, identity
state and canonical object key before each `GetObject` request.

`WORKER_TEMP_ROOT` must be a non-root absolute path. Relative paths are rejected
before normalization. On SIGTERM/SIGINT the worker stops polling immediately,
continues heartbeat renewal during the grace window, and aborts the active
handler only when `WORKER_SHUTDOWN_TIMEOUT_MS` expires. Timeout work is retried
with `WORKER_STOPPING` when the lease is still authoritative, or left for lease
expiry when PostgreSQL is unavailable.
