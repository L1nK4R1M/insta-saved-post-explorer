# Places analysis JSON export - Tasks

## Task rules

Each task maps to requirements and completes through a public test seam. Tests
are table-driven where variants share behavior. No browser E2E is added.

## Phase 1 - Contract and source

- `TASK-01` (`REQ-001`, `REQ-003`, `REQ-006`, `REQ-008`): write RED tests, then
  extend `exportCaptionBatch` for complete forced export, saved-at ordering, and
  explicit overflow detection.
- `TASK-02` (`REQ-005`, `REQ-007`, `REQ-009`): write RED tests, then add the
  strict v2 document schema, deterministic enrichment, counts, and validation.

## Phase 2 - Filesystem and CLI

- `TASK-03` (`REQ-010`, `REQ-011`): write RED tests, then add `.tmp` confinement,
  symlink checks, atomic validation/rename, cleanup, hashing, and autonomous parts.
- `TASK-04` (`REQ-002`, `REQ-004`, `REQ-012`, `REQ-013`): write RED tests, then
  add the thin target-explicit CLI and npm/config contracts.

## Phase 3 - Documentation and verification

- `TASK-05`: update durable workflow, operator documentation, change record, and
  handoff without changing Geoapify/import rules.
- `TASK-06`: run focused tests, PostgreSQL tests when configured, install,
  generation, lint, typecheck, full tests, build, diff check, and status.
- `TASK-07`: run separate spec-compliance and engineering-quality reviews,
  address findings, complete traceability, and set convergence.
- `TASK-08`: if the explicit real target exists, run and validate the real
  export; otherwise record the exact environment gate without fabricating data.

## Dependency graph

`TASK-01 -> TASK-02 -> TASK-03 -> TASK-04 -> TASK-05 -> TASK-06 -> TASK-07 -> TASK-08`
