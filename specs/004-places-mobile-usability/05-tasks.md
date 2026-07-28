# Places mobile usability - Tasks

## Task rules

Tasks are complete only with public-seam evidence. No task may add a migration,
dependency, alternate owner source or broader Production mutation.

## Dependency graph

The three implementation slices are independent. The release and evidence task
depends on every implementation slice plus complete local verification.

- [x] TASK-001: Repair mobile controls and return navigation.
  Requirements: FR-001, FR-002, NFR-001
  Dependencies: none
  Files: Places page, explorer component, global Places CSS, existing E2E tests
  Tests: AT-001, AT-002
  Evidence: EV-001, EV-002
  Done: mobile and desktop browser tests pass with exact bounding evidence.

- [x] TASK-002: Restore public configured-owner linked-post reads.
  Requirements: FR-003, FR-004
  Dependencies: none
  Files: Places actions and existing action/browser tests
  Tests: AT-003, AT-004
  Evidence: EV-003, EV-004
  Done: public read and live linked-thumbnail smoke pass; mutations remain guarded.

- [x] TASK-003: Change future city-like approximation to 10 km.
  Requirements: FR-005, FR-006, NFR-002
  Dependencies: none
  Files: scoring module, existing unit/integration tests, operator documentation
  Tests: AT-005, AT-006
  Evidence: EV-005, EV-006
  Done: focused scoring tests and the 407/646 read-only count pass.

- [x] TASK-004: Promote and verify the critical Production release.
  Requirements: FR-007, FR-008, NFR-003
  Dependencies: TASK-001, TASK-002, TASK-003
  Files: release artifacts and durable handoff/status documentation
  Tests: AT-007, AT-008
  Evidence: EV-007, EV-008
  Done: CI, Preview, Production, backup, guarded transaction and post-release checks pass.
