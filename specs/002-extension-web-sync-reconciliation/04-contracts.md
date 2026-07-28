# Extension web sync reconciliation - Contracts

## API contracts

`POST /api/sync/session` continues returning `jobId`, `token`, `apiBaseUrl`,
`knownExternalIds`, `knownPostCodes` and expiry. It additively returns:

```text
knownPosts: Array<{ externalId: string | null; postCode: string | null }>
```

The array preserves DB row pairing and owner scope. Existing sync post, media
prepare, completion and job routes remain unchanged.

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
The public web-sync task additionally exposes:

```text
progressVersion: number
```

This value is a durable monotonic work checkpoint. It is non-sensitive and
changes when a page commits or a media step succeeds.

## Data contracts

No Prisma or IndexedDB schema change. Archive `seenPks` remains the compatible
flat index and optional `seenPosts` stores canonical paired identities. Website
ownership comes only from the DB session snapshot. On successful completion,
the archive is rebuilt from that snapshot plus rows accepted in the same sync.

## UI contract

**Actualiser les posts** keeps its existing states. A residual archive gap
produces the task's actionable failure text. Missing/stale-extension recovery
asks the user to install or reload the latest extension without naming an old
version. After session creation, the UI may read the existing authenticated
`GET /api/sync/jobs/{jobId}` route. `COMPLETED` settles success using
`collected`; `FAILED` settles an error. Extension messages and polling race
idempotently, and polling stops at the first terminal result.
Duplicate non-terminal extension snapshots do not count as progress. The
90-second watchdog is refreshed only by a changed task progress signature or a
changed server heartbeat.

## Configuration contract

| Variable | Required | Secret | Default | Validation | Owner |
|---|---|---|---|---|---|
| `DATABASE_URL` | Yes per deployed environment | Yes | None | Preview resolves to Neon develop; Production resolves to Neon main | Vercel project owner |

The extension does not read `DATABASE_URL`. It trusts exactly production,
localhost and the stable develop Preview at manifest, content-bridge and
background API-origin boundaries. Wildcard Vercel hosts are outside contract.

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
verification and rate limiting are preserved. Production and localhost origins
remain supported; extension 4.2.6 adds only the exact stable develop Preview.
