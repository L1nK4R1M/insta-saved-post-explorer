# Extension web sync reconciliation - Research and Evidence

## Research questions

| ID | Question | Why it matters | Status |
|---|---|---|---|
| RQ-001 | Which state incorrectly causes the early stop? | Root cause | Closed |
| RQ-002 | Can the current production payload support correction? | Compatibility | Closed |
| RQ-003 | What persistence boundary survives MV3 failure safely? | Data integrity | Closed |
| RQ-004 | What signal proves real progress instead of bridge liveness? | Loop termination | Closed |
| RQ-005 | How can a reinstalled extension converge without making local state authoritative? | DB-first recovery | Closed |

## Evidence ledger

| Claim or decision | Source | Date checked | Confidence | Notes |
|---|---|---|---|---|
| Local archive was unioned with web-known codes | Prior `loadSeenSet()` | 2026-07-28 | High | Exact false-positive mechanism |
| Session already supplies DB-known IDs/codes | Sync session route | 2026-07-28 | High | Existing arrays stay compatible; paired `knownPosts` is required to preserve identity mapping |
| Import replay is idempotent | Import route/service | 2026-07-28 | High | Enables page retry |
| Per-post target commit can skip a later failed post | Fixed-diff engineering review | 2026-07-28 | High | Led to page-atomic commit |
| Repeated identical `running` messages reset the old watchdog | RED fake-timer component test | 2026-07-28 | High | Transport liveness is not work progress |
| v4.2.1 stops on DB-seeded archive and has no repeated-cursor guard | Historical commit comparison | 2026-07-28 | High | Explains false completeness and the terminal-page loop |

## Existing repository findings

- `ArchiveStore` represents extension export history, not web ownership.
- `startWebSync()` previously seeded/consumed that archive as the stop set.
- `stepOnce()` scans one Instagram page and uploads selected rows sequentially.
- `TaskStoreRaw.put()` persists MV3 progress and can occur between uploads.
- The web button already sorts discovered candidates by semantic version.
- The session route can return paired `externalId`/`postCode` identities from
  the same owner-scoped DB rows without a migration.
- A monotonic non-sensitive `progressVersion` can advance after each media source
  and page commit, allowing the web watchdog to distinguish work from repeated
  status delivery.

## Alternatives

| Option | Benefits | Costs | Risks | Fit with existing system |
|---|---|---|---|---|
| Ignore archive during web sync | Smallest diff | Misses older known gaps | Partial reconciliation | Incomplete |
| Full feed scan every click | Complete current-feed comparison | More requests on healthy path | Rate limits | Poor |
| Persist archive-minus-web targets and align archive after success | Reconciles real gaps, repairs a fresh install, and keeps fast healthy path | Additive session identity mapping and task-state checkpoint | Residual stale target | Best |

## Selected approach

Persist archive-only external IDs as reconciliation targets. Use paired
owner-scoped DB identities exclusively for website ownership. Continue beyond
known posts until targets are resolved, and advance target state only after the
page succeeds. Publish a monotonic work checkpoint to the page. Only after a
successful web sync, replace the local archive view with the DB snapshot plus
observed identity mappings and rows accepted during the run.

## Rejected approaches

Do not remove or reinterpret the legacy API arrays, pre-seed the local archive
before a scan succeeds, scan the whole feed unconditionally, or trust a counter
without post identity.

## Remaining unknowns

An archive entry may refer to a post no longer available on Instagram. This is
acceptable uncertainty: the task reports the residual count and never claims
success or invents the post.
