# Extension web sync reconciliation - Contracts

## API contracts

No API contract changes. `POST /api/sync/session` continues returning `jobId`,
`token`, `apiBaseUrl`, `knownExternalIds`, `knownPostCodes` and expiry. Existing
sync post, media prepare, completion and job routes remain unchanged.

## Event and job contracts

The existing `INSTA_POST_EXPLORER_SYNC_V2` messages remain unchanged. A durable
web-sync task may add:

```text
knownExternalIds: string[]
knownPostCodes: string[]
reconciliationTargetIds: string[]
```

Target progress commits only after all selected rows on the current page
succeed. Existing pending/running/paused/completed/failed states remain. A
`next_max_id` equal to the cursor requested for that page is terminal and flows
through the same completion or residual-target failure states.

## Data contracts

No Prisma or IndexedDB schema change. Archive `seenPks` stays local export
history. Website ownership is the union of web session external IDs and post
codes for selection only.

## UI contract

**Actualiser les posts** keeps its existing states. A residual archive gap
produces the task's actionable failure text. Missing/stale-extension recovery
asks the user to install or reload the latest extension without naming an old
version. After session creation, the UI may read the existing authenticated
`GET /api/sync/jobs/{jobId}` route. `COMPLETED` settles success using
`collected`; `FAILED` settles an error. Extension messages and polling race
idempotently, and polling stops at the first terminal result.

## Configuration contract

| Variable | Required | Secret | Default | Validation | Owner |
|---|---|---|---|---|---|
| None | — | — | — | No configuration change | — |

## Feature flags

| Flag | Default | Scope | Removal condition | Rollback role |
|---|---|---|---|---|
| None | — | — | — | Package rollback |

## Error catalog

| Code | Boundary | Meaning | Retryable | User-visible behavior | Telemetry |
|---|---|---|---|---|---|
| Residual target message | MV3 task | Archived posts were not found before feed end | After full export | Count and recovery action | Existing task error |
| Repeated cursor | Instagram pagination | The feed did not advance after a processed page | Automatic terminal handling | Success or residual-target error | Existing task status |
| Lost terminal message | Extension-to-page bridge | Background completed but the page missed the final state | Automatic authenticated job polling | Server success or failure replaces the spinner | Existing job status |
| Existing sync errors | Existing boundaries | Auth, network, R2 or Instagram failure | Existing policy | Unchanged | Unchanged |

## Compatibility guarantees

Current web API payload and existing extension messaging remain compatible.
Local export, media-only download, owner isolation, import idempotency, R2
verification and rate limiting are preserved.
