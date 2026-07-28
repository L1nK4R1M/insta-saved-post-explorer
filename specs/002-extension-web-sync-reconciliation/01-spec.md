# Extension web sync reconciliation - Specification

## Problem

The web refresh treats locally archived extension posts as if they were already
stored by the web application. It can stop at the first locally known post and
return zero synchronized posts while PostgreSQL is missing newer exports.

## Outcome

Explicit refresh reconciles the extension archive against the website's actual
owner-scoped identifiers. A successful result cannot hide a known archive gap.

## Goals

- Import extension-only saved posts through the existing secure sync path.
- Preserve fast incremental behavior when no gap exists.
- Preserve local export behavior, replay safety and MV3 restart safety.
- Provide a loadable version 4.2.5 package and accurate operator guidance.
- Support the stable develop Preview through the same extension sync flow.

## Non-goals

- Delete synchronization, collection synchronization or historical post repair.
- Schema, migration, API, authentication, R2 permission or dependency changes.
- Production deployment or Chrome Web Store publication.

## Users and permissions

Only the authenticated administrator may create a sync session. The extension
uses the existing job-bound token and Instagram browser session. No permission
is widened.

## User stories

- US-001: As the owner, I can refresh the web library after a local extension
  export and see the missing posts imported.
- US-002: As the owner, I receive an explicit incomplete result rather than a
  false success when an archived target cannot be found.

## Functional requirements

- FR-001: Web synchronization uses only `knownExternalIds` and
  `knownPostCodes` supplied by the web session to decide website ownership.
- FR-002: IDs present in the extension archive but absent from web-known
  external IDs become durable reconciliation targets.
- FR-003: A website-known post does not stop the scan while a reconciliation
  target remains; website-known posts are not uploaded again.
- FR-004: Local extension-only incremental exports continue to stop on the
  extension archive.
- FR-005: A web sync with residual targets at feed completion fails with the
  unresolved count instead of reporting success.
- FR-006: Target resolution commits only after every selected post on the page
  uploads/imports successfully.
- FR-007: The corrected extension is version 4.2.5 and web recovery copy asks
  for the latest extension without a stale hard-coded version.
- FR-008: A page whose next Instagram cursor equals the cursor just requested
  is terminal, so the task cannot poll the same final page forever.
- FR-009: After creating a sync session, the web refresh independently observes
  its owner-scoped server job and reaches the same terminal success or failure
  state when the extension-to-page terminal message is lost.
- FR-010: The exact stable develop Preview origin
  `https://insta-saved-post-explorer-git-develop-l1nk4r1ms-projects.vercel.app`
  is present in manifest injection/host permissions, content-bridge message
  validation and background API-origin validation.

## Non-functional requirements

- NFR-001: A healthy web sync with no archive gap stops at the first web-known
  post, preserving the current bounded incremental request path.
- NFR-002: Reconciliation targets persist in the durable MV3 task and survive a
  worker restart or a failed later upload without premature removal.
- NFR-003: No Prisma schema, migration, API route, secret, R2 permission or
  dependency changes. The only permission expansion is the exact develop
  Preview origin.
- NFR-004: Focused policy tests, neighboring sync tests, syntax checks, lint,
  typecheck, full tests and production build all pass.
- NFR-005: Pagination must always make forward progress or transition to a
  terminal task state visible to the web UI.
- NFR-006: Server polling is same-origin, stops after a terminal result or
  component cleanup, tolerates transient read failures and settles each refresh
  at most once.
- NFR-007: No wildcard Vercel origin is trusted; production and localhost
  behavior remain unchanged.

## Business rules and invariants

- BR-001: PostgreSQL/web session state is authoritative for website ownership;
  the extension archive is evidence of reconciliation work only.
- BR-002: Imports remain owner-scoped and idempotent; retry may update but never
  duplicate the canonical post.
- BR-003: Missing or deleted Instagram posts are never invented or silently
  removed from either store.
- BR-004: Page target state advances atomically after all selected uploads.
- BR-005: A non-advancing cursor is treated as feed completion; the existing
  residual-target check still prevents false success.
- BR-006: The owner-scoped `SyncJob` is the durable terminal-state fallback;
  extension messages remain the lower-latency progress channel.
- BR-007: Preview uses its environment-scoped `DATABASE_URL` and separate Neon
  develop branch; the extension origin change never selects a database itself.

## Failure and edge-case behavior

| Condition | Expected behavior | User-visible result | Recovery |
|---|---|---|---|
| Archive-only target behind newer web-known post | Skip known post and continue | Missing post synchronizes | Automatic |
| No archive gap | Stop at first web-known post | Zero new is valid | None |
| Later upload on page fails | Keep pre-page targets durable | Existing pause/failure state | Retry idempotently |
| Target absent at feed end | Fail with residual count | Actionable incomplete message | Full export, then retry |
| Instagram repeats the requested cursor | Stop after the processed page | Success or residual-target error | Automatic |
| Terminal extension message is lost | Read the authenticated server job | Spinner becomes success or error | Automatic |
| Multiple extension installations | Highest discovered version is tried first | Corrected extension wins | Remove/reload stale copy |
| Untrusted or dynamic Vercel deployment | Reject discovery/start messages | Extension remains unavailable | Add a reviewed exact origin only if required |

## Data and privacy requirements

No new data category is collected. Existing post IDs remain in extension
IndexedDB and owner-scoped session payloads. Instagram cookies remain inside the
extension. No secret or token is logged or packaged.

## Dependencies and constraints

Chrome MV3 module worker, current IndexedDB schema, existing session/token,
Instagram rate limiting, R2 verification and idempotent import remain mandatory.

## Acceptance summary

The production scenario, healthy path, local path, incomplete result, page
failure/retry and version/package contract are deterministically tested.

## Unresolved decisions

None.

## Change-control note

Changes to behavior must update this file before the feature can receive a final PASS.
