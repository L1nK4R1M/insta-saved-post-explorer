# Extension web sync reconciliation - Technical Design

## Design summary

A pure MV3-compatible policy module separates local archive evidence from
website ownership, computes archive-only targets, selects safe page rows and
commits target progress only after the full selected page succeeds.

Requirement mapping: FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, FR-007,
FR-008, FR-009, FR-010, FR-011, FR-012 and FR-013 are implemented through this
flow. NFR-001, NFR-002, NFR-003, NFR-004, NFR-005, NFR-006, NFR-007, NFR-008
and NFR-009 govern bounded execution, durability, compatibility, progress and
verification.

## Repository impact map

| Module or service | Current responsibility | Planned change | Compatibility risk |
|---|---|---|---|
| `sync-policy.js` | New pure policy seam | Targets, page selection, completion error, page commit helper | Low |
| `background.js` | MV3 scan/upload state machine | Use web-only known set, durable targets and post-success DB archive alignment | Medium |
| Sync session route | Owner-scoped DB identity snapshot | Add paired `knownPosts` while preserving legacy arrays | Medium |
| Manifest/README | Package identity, exact origins and guidance | Version 4.2.6 plus stable develop Preview | Medium |
| `content-bridge.js` | Page-message trust boundary | Add the exact develop Preview origin | Medium |
| `background.js` | Sync API trust boundary | Add the same exact develop Preview origin | Medium |
| Refresh button/docs | Recovery/operator copy and terminal fallback | Poll the owner-scoped job and distinguish transport liveness from task progress | Medium |

## Architecture and dependency flow

`POST /api/sync/session` → content bridge → MV3 background worker →
`sync-policy.js` → existing Instagram client/R2 upload/import endpoints.

The policy has no Chrome, network or database dependency. The background worker
owns IndexedDB state and side effects. The existing session route additively
returns paired DB identities while preserving its two legacy arrays; no route is
added. The web button also polls the existing authenticated job route until that
job becomes terminal, so a lost content-script message cannot leave the UI
running forever.
Manifest injection, page-message validation and API-origin validation use the
same exact Preview origin. The extension never accepts `*.vercel.app`.

## Runtime flows

### Success flow

1. Web session returns owner-scoped paired external IDs and URL codes, plus the
   legacy flat arrays.
2. Extension computes canonical archive identities absent from the DB snapshot.
3. The target list and web-known identifiers are stored on the web-sync task.
4. Page selection skips website-known rows but continues while a target remains.
5. All selected rows upload/import through existing secure paths.
6. Only after the page succeeds does the task commit the page's remaining target
   list and cursor.
7. Once targets are empty, the next web-known row is a safe stop boundary.
8. A repeated `next_max_id` is terminal after that page is processed; residual
   targets still convert terminal completion into an explicit failure.
9. Extension messages provide live progress while the web app independently
   observes the server job. The first terminal signal settles the UI once and
   stops polling.
10. The public extension task includes a monotonic work checkpoint advanced by
    page commits and successful media steps. Duplicate `running` snapshots do
    not refresh the 90-second progress watchdog.
11. Only after terminal success, the extension canonicalizes its archive from
    the paired DB snapshot and rows accepted during the run. Pre-sync archive
    entries never become website-owned merely because they are local.

### Failure and degraded flows

An upload, progress write or page commit failure leaves pre-page targets
durable. Retry may replay already imported rows through canonical idempotent
upsert. Feed completion with targets remaining becomes a failed task with an
actionable count. A repeated cursor cannot leave the task indefinitely running.
Transient job-read failures are retried; component cleanup or a terminal result
cancels the next poll. A responsive bridge that repeatedly returns the same
non-terminal checkpoint is treated as stalled rather than healthy.

## Data model and lifecycle

No database or IndexedDB schema migration. Existing task objects gain optional
arrays `knownExternalIds`, `knownWebsitePosts` and `reconciliationTargetIds`;
the archive record gains optional canonical `seenPosts`. IndexedDB accepts
additive object fields. Legacy `seenPks` remains populated for compatibility.

## Concurrency, idempotency, retries, and ordering

Existing mutual exclusion between local and web tasks remains. Instagram order
is newest-first. Import idempotency and canonical post URLs make page replay
safe. Target progress commits at the page boundary to avoid skipping later
failed rows.

## Error handling

Existing classified pause/failure behavior remains. A residual-target error is
French user-facing text under 255 characters and is passed through the existing
completion endpoint and UI task state.

## Security and privacy

### Data classification

Post identifiers are owner-scoped application data. Sync tokens and Instagram
cookies remain sensitive; neither is changed, logged or exposed.

### Trust boundaries

The authenticated web session defines website ownership. Extension archive
state is untrusted for ownership and is used only to request reconciliation.
Post/media validation remains server-side.

### Threat model

| Risk ID | Threat | Entry point | Impact | Mitigation | Verification |
|---|---|---|---|---|---|
| TH-001 | Crafted archive ID claims website ownership | IndexedDB | Omission | Archive never enters ownership set | AT-001 |
| TH-002 | Restart forgets failed target | MV3 lifecycle | False success | Durable pre-page targets | AT-005 |
| TH-003 | Replay duplicates posts | Retry | Duplicate data | Existing owner/canonical idempotency | Neighbor/full tests |
| TH-004 | Arbitrary Vercel deployment obtains the sync bridge | Manifest/message/API origin gates | Job token misuse | Allow one exact develop Preview origin at all three gates; forbid wildcard | AT-009 |
| TH-005 | Preview writes production data | Vercel environment configuration | Production contamination | Environment-scoped `DATABASE_URL` values and separate Neon branches; extension does not choose DB | Configuration review |

## AI and tool-safety controls

Not applicable. No model, agent, retrieval or tool execution is introduced.

## Performance and capacity

Healthy path remains one incremental boundary. Additional pages are requested
only while archive-only targets exist, under the existing 150 requests/hour
spacing and retry rules. The server's 10,000-identifier cap is unchanged.

## Observability

Existing extension task fields and server `SyncJob` status/counts remain the
operational signals. The public task adds only `progressVersion`, advanced by
durable page and media progress; it does not expose the Instagram cursor. Residual
targets surface their count. No token, cookie, media URL or object credential
is added to telemetry.

## Migration and compatibility

No migration. Optional task fields are backward-compatible. The corrected
extension consumes the additive paired snapshot or falls back to the existing
flat arrays; older extensions ignore `knownPosts` and continue their old
behavior until replaced. Version 4.2.6 additionally injects into the stable
develop Preview while retaining production and localhost.

## Rollout

Review and merge the code, deploy the web copy only with authorization, then
replace files in the existing extension folder with 4.2.6 and reload it. Run one
controlled production refresh and compare extension/web counts.
For Preview validation, use 4.2.6 and the stable develop alias after the source
is merged/deployed there.

## Rollback

Stop an active sync, reinstall the previous extension files and revert the code
change. Do not delete posts already imported; replay remains valid.

## Architecture decisions

| ADR | Decision | Status |
|---|---|---|
| ADR-0001 | Web state owns import identity; archive state defines reconciliation targets | ACCEPTED |

## Testability

The pure policy module supports deterministic page and failure injection tests.
The page helper accepts upload/progress/commit callbacks, allowing a later
upload failure to prove that commit is not invoked. A focused component test
proves that an absent terminal extension event is recovered from a completed
server job.
