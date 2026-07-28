# Traceability Matrix

Generated from `01-spec.md`, `05-tasks.md`, and `06-validation.md`.

| Requirement | Summary | Tasks | Acceptance tests | Evidence IDs | Coverage |
|---|---|---|---|---|---|
| FR-001 | The complete 2D/3D segmented control remains visible at supported mobile widths. | TASK-001 | AT-001 | EV-001, EV-002 | Covered |
| FR-002 | The Places page provides an explicit labelled link to the post library. | TASK-001, TASK-003 | AT-002, AT-005 | EV-001, EV-002, EV-005, EV-006 | Covered |
| FR-003 | A public selected place loads linked post summaries through the configured owner scope. | TASK-002, TASK-004 | AT-003, AT-008 | EV-001, EV-002, EV-003, EV-004, EV-005, EV-006, EV-007, EV-008 | Covered |
| FR-004 | Place confirmation and rejection remain administrator-only operations. | TASK-002 | AT-004 | EV-003, EV-004 | Covered |
| FR-005 | New city-like approximate provider results use a 10,000 metre radius. | TASK-003 | AT-005 | EV-005, EV-006 | Covered |
| FR-006 | Operator documentation distinguishes 407 post records from 646 location candidates. | TASK-003 | AT-006 | EV-005, EV-006 | Covered |
| FR-007 | Production code is promoted only after successful CI and READY Preview evidence. | TASK-004 | AT-007 | EV-007, EV-008 | Covered |
| FR-008 | Exactly 29 existing approximate 25,000 metre rows are corrected after a Neon backup. | TASK-004 | AT-008 | EV-001, EV-002, EV-003, EV-004, EV-005, EV-006, EV-007, EV-008 | Covered |
| NFR-001 | The mobile page has no view-switch clipping or horizontal overflow. | TASK-001 | AT-001 | EV-001, EV-002 | Covered |
| NFR-002 | The change adds no schema migration or dependency and preserves aggregate relations. | TASK-003 | AT-005 | EV-005, EV-006 | Covered |
| NFR-003 | Rollback retains the preceding Vercel deployment and an immutable Neon snapshot. | TASK-004 | AT-008 | EV-001, EV-002, EV-003, EV-004, EV-005, EV-006, EV-007, EV-008 | Covered |

Uncovered requirements: 0

This generated matrix checks references, not semantic correctness. Final convergence must inspect the implementation and evidence.
