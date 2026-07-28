# Extension web sync reconciliation - Intake

Feature: 002
Mode: critical
Created: 2026-07-28

## Original request

Production reports that the extension's saved-post count is ahead of the web
application. Clicking **Actualiser les posts** says the library is current and
imports nothing, even though recently exported extension media are absent. The
web application must align with the corrected extension on explicit refresh.

During the production smoke of version 4.2.3, the refresh spinner remained
active when the scan appeared to reach the feed end and never displayed a final
confirmation. The engine had no non-progress guard when Instagram repeated the
cursor that had just been requested.

Direct Chrome inspection after loading 4.2.4 then showed a second failure mode:
the durable extension task was `completed`, but the page still displayed a
running refresh. The final extension-to-page state message can be lost as the
content bridge stops, while the existing server job remains available as a
durable owner-scoped fallback.

The develop Preview then exposed a separate environment boundary: the extension
only injected and accepted sync messages on production and localhost. The owner
confirmed that Vercel Preview and Production use separate `DATABASE_URL`
variables backed by separate Neon branches. The stable develop Preview must be
allowed explicitly without trusting arbitrary `*.vercel.app` deployments.

## Desired outcome

A web refresh imports extension-known posts missing from the owner-scoped web
library, never confuses the extension archive with database ownership, and never
reports success while a known local gap remains unresolved.

## Existing-system evidence

| Evidence | Path or source | Relevance |
|---|---|---|
| Web session returns DB-known external IDs and post codes | `src/app/api/sync/session/route.ts` | Authoritative web state already exists |
| Web sync merged `ArchiveStore.seenPks` into the stop set | `extension/ig-saved-sync/background.js` before this change | Demonstrated false “already known” cause |
| Imports are owner-scoped and idempotent | `src/app/api/sync/posts/route.ts`, `src/server/import-posts.ts` | Safe replay boundary |
| Production symptom | Owner report, 2026-07-28 | Exact acceptance scenario |
| Repeated cursor has no terminal guard | `stepOnce()` pagination before 4.2.4 | Deterministic infinite final-page loop |
| Completed extension task with running web button | Active Chrome extension IndexedDB and loaded 4.2.4 worker | Demonstrates a lost terminal bridge message |
| Develop Preview is absent from all extension origin gates | `manifest.json`, `content-bridge.js`, `background.js` | Explains why Preview cannot discover or start the extension |
| Production and Preview use separate Neon branches | Direct Neon inspection plus owner-confirmed environment-scoped `DATABASE_URL` values | Allows bounded Preview testing without sharing the production database |

## Brownfield baseline

The MV3 extension has separate durable task, page, media and archive stores. A
web refresh creates a short-lived owner/job token and sends web-known IDs. The
worker scans newest-first with existing rate limits, uploads media to R2 and
calls the idempotent import endpoint. Local incremental export legitimately
stops on the local archive; web reconciliation must not.

## Assumptions

| ID | Assumption | Evidence | Risk if wrong | Resolution |
|---|---|---|---|---|
| ASM-001 | Archive IDs are Instagram post primary keys | `finalizeArchive()` records row `pk` values | Targets could be over-reported | Compare with web external IDs and resolve by URL code during scan |
| ASM-002 | Corrected extension can use the current production sync payload | Payload fields are unchanged | Coordinated deploy would be required | Preserve `knownExternalIds` and `knownPostCodes` |
| ASM-003 | The stable develop deployment remains `https://insta-saved-post-explorer-git-develop-l1nk4r1ms-projects.vercel.app` | Existing Vercel develop alias | A renamed alias would remain blocked | Keep one exact allowlisted origin and update deliberately if the alias changes |

## Open questions

No blocking question remains. Production deployment and store publication are
separate approvals and are not part of this corrective implementation.

## Risk classification

| Risk factor | Score | Rationale |
|---|---:|---|
| Production data consistency | 3 | False completeness hides missing posts |
| Cross-boundary contract | 3 | Browser extension, web session, R2 and import |
| Recovery/restart behavior | 2 | MV3 worker may restart mid-page |
| Reversibility | 1 | Code-only, idempotent, no migration |

Total score: 9
Selected mode: critical

## Scope routing decision

Critical workflow is required because the defect crosses a production sync
contract and can silently omit user data. The implementation remains a bounded
maintenance slice with no schema, authentication or deployment change. It
deliberately widens the extension host permission by one exact trusted origin.
