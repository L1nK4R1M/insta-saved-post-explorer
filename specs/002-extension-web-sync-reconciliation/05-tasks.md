# Extension web sync reconciliation - Tasks

## Task rules

- Each task maps requirements, tests and evidence.
- No task may expand into schema, new-route, broad permission, deployment or
  store work. Additive compatibility fields on the existing session response
  remain in scope when required by the accepted contract.
- Critical completion requires dual review, rollback and convergence.

## Phase 1 - Foundations

- [x] TASK-001: Demonstrate and specify state-ownership separation
  - Requirements: FR-001, FR-002, FR-003, NFR-003
  - Dependencies: None
  - Files: `specs/002-extension-web-sync-reconciliation`, existing sync sources
  - Tests: AT-001
  - Evidence: EV-001
  - Done: Cause, alternatives, contracts, hazards and acceptance seams recorded.

## Phase 2 - Core implementation

- [x] TASK-002: Implement restart-safe extension/web reconciliation
  - Requirements: FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, NFR-001, NFR-002
  - Dependencies: TASK-001
  - Files: `extension/ig-saved-sync/background.js`, `extension/ig-saved-sync/sync-policy.js`, `extension/ig-saved-sync/sync-policy.d.ts`
  - Tests: AT-001, AT-002, AT-003, AT-004, AT-005
  - Evidence: EV-002, EV-003
  - Done: Web-only ownership, durable targets, residual error and page-atomic commit pass RED/GREEN tests.

## Phase 3 - Integration and hardening

- [x] TASK-003: Converge package, UI recovery and operator documentation
  - Requirements: FR-007, NFR-003, NFR-004
  - Dependencies: TASK-002
  - Files: manifest, README, refresh button, `docs/instagram-extension-sync.md`, tests
  - Tests: AT-006
  - Evidence: EV-004, EV-005
  - Done: Version 4.2.3 was coherent and flat; later maintenance tasks advance package identity.

## Phase 4 - Release readiness

- [x] TASK-004: Review, verify and record rollback
  - Requirements: FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, FR-007, NFR-001, NFR-002, NFR-003, NFR-004, BR-001, BR-002, BR-003, BR-004
  - Dependencies: TASK-003
  - Files: VibeSpec convergence/release/evidence
  - Tests: AT-001 through AT-006
  - Evidence: EV-006, EV-007
  - Done: No open HIGH/BLOCKER, traceability complete, release ready but not deployed.

- [x] TASK-005: Stop non-advancing Instagram pagination
  - Requirements: FR-008, NFR-005, BR-005
  - Dependencies: TASK-002
  - Files: `extension/ig-saved-sync/sync-policy.js`, `extension/ig-saved-sync/sync-policy.d.ts`, `extension/ig-saved-sync/background.js`, manifest, README, tests and VibeSpec evidence
  - Tests: AT-007
  - Evidence: EV-008
  - Done: A repeated requested cursor transitions to success or the existing residual-target failure and package 4.2.4 passes all gates.

- [x] TASK-006: Recover a lost terminal extension message from the server job
  - Requirements: FR-009, NFR-006, BR-006
  - Dependencies: TASK-005
  - Files: `src/features/library/components/refresh-posts-button.tsx`, focused test, VibeSpec evidence
  - Tests: AT-008
  - Evidence: EV-009
  - Done: The existing authenticated job route settles the UI once; stale
    dual-channel communication becomes an actionable error after 90 seconds.

- [x] TASK-007: Allow the stable develop Preview through every extension origin gate
  - Requirements: FR-007, FR-010, NFR-003, NFR-007, BR-007
  - Dependencies: TASK-006
  - Files: extension manifest, content bridge, background worker, README,
    operator docs, focused policy test and VibeSpec evidence
  - Tests: AT-006, AT-009
  - Evidence: EV-010, EV-011
  - Done: RED/GREEN, all repository gates, exact-origin review and flat 4.2.5
    package verification pass; live Preview smoke remains a rollout action.

- [x] TASK-008: Converge the DB-owned extension index and stop transport-only spinner liveness
  - Requirements: FR-007, FR-011, FR-012, FR-013, NFR-006, NFR-008,
    NFR-009, BR-001, BR-006, BR-008
  - Dependencies: TASK-006
  - Files: background public task state, refresh button, manifest, focused test,
    operator docs and VibeSpec evidence
  - Tests: AT-010, AT-011
  - Evidence: EV-012
  - Done: Repeated identical `running` snapshots become an actionable error
    after 90 seconds, changed page checkpoints keep legitimate scans alive, and
    a successful sync aligns a fresh or locally advanced archive to the DB.

## Dependency graph

TASK-001 → TASK-002 → TASK-003 → TASK-004 → TASK-005 → TASK-006 → TASK-007
