# Extension web sync reconciliation - Research and Evidence

## Research questions

| ID | Question | Why it matters | Status |
|---|---|---|---|
| RQ-001 | Which state incorrectly causes the early stop? | Root cause | Closed |
| RQ-002 | Can the current production payload support correction? | Compatibility | Closed |
| RQ-003 | What persistence boundary survives MV3 failure safely? | Data integrity | Closed |

## Evidence ledger

| Claim or decision | Source | Date checked | Confidence | Notes |
|---|---|---|---|---|
| Local archive was unioned with web-known codes | Prior `loadSeenSet()` | 2026-07-28 | High | Exact false-positive mechanism |
| Session already supplies DB-known IDs/codes | Sync session route | 2026-07-28 | High | No API change required |
| Import replay is idempotent | Import route/service | 2026-07-28 | High | Enables page retry |
| Per-post target commit can skip a later failed post | Fixed-diff engineering review | 2026-07-28 | High | Led to page-atomic commit |

## Existing repository findings

- `ArchiveStore` represents extension export history, not web ownership.
- `startWebSync()` previously seeded/consumed that archive as the stop set.
- `stepOnce()` scans one Instagram page and uploads selected rows sequentially.
- `TaskStoreRaw.put()` persists MV3 progress and can occur between uploads.
- The web button already sorts discovered candidates by semantic version.

## Alternatives

| Option | Benefits | Costs | Risks | Fit with existing system |
|---|---|---|---|---|
| Ignore archive during web sync | Smallest diff | Misses older known gaps | Partial reconciliation | Incomplete |
| Full feed scan every click | Complete current-feed comparison | More requests on healthy path | Rate limits | Poor |
| Persist archive-minus-web targets | Reconciles real gaps and keeps fast healthy path | Small policy/task addition | Residual stale target | Best |

## Selected approach

Persist archive-only external IDs as reconciliation targets. Use web-known IDs
and codes exclusively for website ownership. Continue beyond known posts until
targets are resolved, and advance target state only after the page succeeds.

## Rejected approaches

Do not change the API payload, seed the local archive from web IDs, scan the
whole feed unconditionally, or trust a counter without post identity.

## Remaining unknowns

An archive entry may refer to a post no longer available on Instagram. This is
acceptable uncertainty: the task reports the residual count and never claims
success or invents the post.
