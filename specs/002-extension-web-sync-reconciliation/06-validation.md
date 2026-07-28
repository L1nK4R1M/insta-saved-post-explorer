# Extension web sync reconciliation - Validation

## Validation strategy

Use focused policy tests for selection, incomplete completion, DB/archive
identity convergence and injected page failure, plus component tests for the
lost-message fallback and stalled-progress watchdog. Verify the additive session
mapping through a pure server helper. Reuse the full sync/import suite for
contract safety, then run repository lint, typecheck, full tests and production
build. No database migration test is needed because the Prisma schema is
unchanged.

## Acceptance scenarios

### AT-001: Archive-only post behind a website-known post

Requirements: FR-001, FR-002, FR-003, BR-001

Given a newer and older post known by the website with an archive-only post between
When the page is selected for web reconciliation
Then known posts are skipped, the missing post is selected and the older known post becomes the safe boundary

### AT-002: Healthy web boundary

Requirements: FR-003, NFR-001

Given no archive-only target
When a new post is followed by a website-known post
Then only the new post is selected and the page stops early

### AT-003: Local export compatibility

Requirements: FR-004

Given a local incremental export
When the local archive contains a post
Then selection stops on that archive entry as before

### AT-004: Residual target is not success

Requirements: FR-005, BR-003

Given archive targets remain at feed completion
When completion is evaluated
Then the task returns their count and recovery action instead of success

### AT-005: Page target commit is atomic

Requirements: FR-006, NFR-002, BR-002, BR-004

Given two selected posts and a failure on the second upload
When the page helper runs
Then progress for the first may be recorded but page target commit is never called

### AT-006: Corrected package and recovery copy

Requirements: FR-007, NFR-003, NFR-004

Given the corrected source
When package identity and web copy are inspected
Then manifest/README are 4.2.6 and the UI asks for the latest extension

### AT-007: Non-advancing Instagram cursor

Requirements: FR-008, NFR-005, BR-005

Given Instagram marks a page as having more data but returns the cursor that was requested
When terminal pagination is evaluated
Then the page is terminal and the task reaches success or the residual-target failure

### AT-008: Lost terminal extension message

Requirements: FR-009, NFR-006, BR-006

Given a web refresh has created a sync job and no terminal extension message arrives
When the authenticated job route reports `COMPLETED`
Then the spinner stops, the synchronized count is shown and completion fires once

### AT-009: Exact develop Preview origin

Requirements: FR-010, NFR-003, NFR-007, BR-007

Given extension 4.2.6 source and manifest
When the three origin boundaries are inspected
Then production, localhost and the exact stable develop Preview are accepted,
and no wildcard Vercel origin is present

### AT-010: Responsive bridge without task progress

Requirements: FR-011, NFR-006, NFR-008, BR-008

Given the extension repeatedly returns the same non-terminal `running` snapshot
When more than 90 seconds pass without a changed progress checkpoint or server heartbeat
Then the web refresh stops spinning and displays the stalled-sync recovery error

Given the page checkpoint changes before the watchdog expires
When polling continues
Then the watchdog remains active for the legitimate advancing scan

### AT-011: DB-owned archive convergence

Requirements: FR-012, FR-013, NFR-009, BR-001

Given an empty extension archive and paired identities from the owner-scoped DB
When web synchronization succeeds
Then the extension stores one canonical archive entry per DB post

Given a local export contains a post absent from the DB snapshot
When the DB accepts that post during web synchronization
Then the final archive and DB snapshot converge without a duplicate code-only entry

## Unit tests

`tests/unit/extension-sync-policy.test.ts` covers AT-001 through AT-007 and
AT-009 and AT-011 in seven risk-focused tests. `tests/unit/refresh-posts-button.test.tsx`
covers AT-008 and AT-010.

## Integration and contract tests

The focused final run covers extension policy, media upload, refresh UI and
session identity mapping: 4 files, 13 tests. The full suite covers the remaining
sync token, enrichment and import normalization contracts.

## End-to-end tests

Not added. Chrome extension execution is not part of the Playwright application
harness. A controlled Chromium probe loaded unpacked 4.2.6 and received a valid
Production `DISCOVER` response. Authenticated end-to-end Instagram/Preview smoke
remains a rollout check because the controlled profile has neither session.

## Security and abuse tests

Existing auth/token/R2 tests remain in the full suite. AT-009 proves the
permission expansion is exact and rejects a Vercel wildcard; diff review proves
no token, API or R2 capability change.

## Performance and capacity tests

The deterministic healthy-path test proves early stop remains. Existing request
spacing remains 150/hour; no benchmark is needed for a set/filter policy.

## Migration and recovery tests

No migration. AT-005 injects a later upload failure and proves safe replay state.
Rollback is package/code replacement with no data deletion.

## Quality commands

| Gate | Command | Expected result | Evidence |
|---|---|---|---|
| Install | `npm ci` | Clean install | EV-001 |
| Prisma client only | `npm run db:generate` | Generated, no migration | EV-001 |
| Syntax | `node --check` on both MV3 JS files | Exit 0 | EV-002 |
| Focused | policy, media-upload, refresh-button and session tests | 13/13 | EV-002, EV-008, EV-009, EV-010, EV-012 |
| Lint | `npm run lint` | Exit 0 | EV-004 |
| Types | `npm run typecheck` | Exit 0 | EV-004 |
| Full tests | `npm run test` | 329 pass, 129 skip | EV-004, EV-008, EV-009, EV-012 |
| Build | `npm run build` | 32 pages | EV-004 |
| Package | ZIP listing and SHA-256 | Flat, required files | EV-005, EV-011, EV-012 |
| Diff | `git diff --check` | Exit 0 | EV-006 |

## Evidence ledger

| Evidence ID | Requirement or risk | Command or artifact | Result | Location |
|---|---|---|---|---|
| EV-001 | Reproducible environment | install/generate | PASS; npm audit reports existing 12 high findings, no audit fix | command output |
| EV-002 | Core behavior and syntax | RED/GREEN + node checks | PASS, 5/5 | focused test |
| EV-003 | Neighbor contracts | focused 5-file run | PASS, 28/28 | command output |
| EV-004 | Repository regression | lint/typecheck/test/build | PASS | command output |
| EV-005 | Installable extension | `insta-saved-sync-v4.2.4.zip` | PASS, SHA-256 `F3C1A317D65EDC8D5DF2662954E3412A2941B82CD81524FD5E30831B0F30D2BC` | `C:\tmp` |
| EV-006 | Scope/format | diff, migration and whitespace review | PASS | verification report |
| EV-007 | Critical convergence | spec and engineering reviews | PASS, no HIGH/BLOCKER | `07-convergence.md` |
| EV-008 | Production final-page loop regression | RED/GREEN repeated-cursor test, engine wiring and full gates | PASS, 6/6 focused and visible terminal state | command output and verification report |
| EV-009 | Lost terminal bridge message | RED/GREEN refresh-button component test and fresh gates | PASS; 1/1 focused, 326 pass full suite | command output |
| EV-010 | Preview origin contract | RED/GREEN manifest/source contract test | PASS; Production, localhost and exact Preview allowed, wildcard rejected | command output and Preview-origin report |
| EV-011 | Installable extension 4.2.5 | ZIP listing, manifest inspection and SHA-256 | PASS; flat ZIP, SHA-256 `9F842FD55066B2E88E981A1B545ABAB101E6AE0AE462D92349863FAE7E94479D` | `C:\tmp` |
| EV-012 | DB-first convergence and non-progress termination | RED/GREEN tests, syntax, lint, exact typecheck, full suite, build, Chrome discovery and 4.2.6 package inspection | PASS; focused 13/13, full 329/129, 32-page build, flat ZIP SHA-256 `E7EF63C70AC5054975A5B07C51BF6388EBC2048797719B6FE93008A237C5A48E` | `evidence/2026-07-28-db-first-sync-loop-verification.md`, `C:\tmp\insta-saved-sync-v4.2.6-db-first.zip` |

## Manual validation

After rollout: replace files in the existing extension folder, reload it,
refresh the production page, click **Actualiser les posts**, then compare DB/web
and extension counts. Confirm that a second refresh completes with zero new
posts, and that repeated identical task snapshots become an actionable error
instead of an endless spinner. The authenticated Instagram flow is not claimed
by the controlled-profile discovery probe.
