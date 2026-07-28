# Extension web sync reconciliation - Validation

## Validation strategy

Use one focused policy suite for selection, incomplete completion and injected
page failure, plus one component test for the lost-message fallback. Reuse
neighboring sync/import tests for contract safety, then run repository lint,
typecheck, full tests and production build. No DB or end-to-end browser test is
needed because the existing authenticated job contract is reused.

## Acceptance scenarios

### AT-001: Archive-only post behind a website-known post

Requirements: FR-001, FR-002, FR-003

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

Requirements: FR-006, NFR-002, BR-004

Given two selected posts and a failure on the second upload
When the page helper runs
Then progress for the first may be recorded but page target commit is never called

### AT-006: Corrected package and recovery copy

Requirements: FR-007, NFR-003, NFR-004

Given the corrected source
When package identity and web copy are inspected
Then manifest/README are 4.2.4 and the UI asks for the latest extension

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

## Unit tests

`tests/unit/extension-sync-policy.test.ts` covers AT-001 through AT-007 in six
risk-focused tests. `tests/unit/refresh-posts-button.test.tsx` covers AT-008.

## Integration and contract tests

The focused neighboring run includes media upload, sync token, enrichment and
import normalization: 5 files, 28 tests.

## End-to-end tests

Not added. Chrome extension execution is not part of the Playwright application
harness; the policy/failure seam is deterministic and the web message contract
is unchanged. A production smoke is reserved for authorized rollout.

## Security and abuse tests

Existing auth/token/R2 tests remain in the full suite. Diff review proves no
host permission, token, API or R2 capability change.

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
| Focused | policy and refresh-button component tests | 7/7 | EV-002, EV-008, EV-009 |
| Neighboring | focused 5-file run | 29/29 | EV-003, EV-008 |
| Lint | `npm run lint` | Exit 0 | EV-004 |
| Types | `npm run typecheck` | Exit 0 | EV-004 |
| Full tests | `npm run test` | 326 pass, 129 skip | EV-004, EV-008, EV-009 |
| Build | `npm run build` | 32 pages | EV-004 |
| Package | ZIP listing and SHA-256 | Flat, required files | EV-005 |
| Diff | `git diff --check` | Exit 0 | EV-006 |

### Production hotfix verification

The isolated `main`-based hotfix has a smaller historical suite than `develop`.
Fresh production-base gates are recorded separately: focused 7/7, lint PASS,
typecheck PASS, full suite 149 passed and 22 skipped, and production build PASS
with 27 generated pages. See EV-010.

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
| EV-010 | Isolated production promotion | Fresh gates on `origin/main` without unrelated develop phases | PASS locally; hosted checks and smoke pending | `evidence/2026-07-28-production-hotfix-verification.md` |

## Manual validation

After authorized rollout only: replace files in the existing extension folder,
reload it, refresh the production page, click **Actualiser les posts**, then
compare web and extension counts. This is not claimed as executed locally.
Also confirm that reloading the page clears the previously stale visual state
and that a new refresh terminates from either the extension event or server job.
