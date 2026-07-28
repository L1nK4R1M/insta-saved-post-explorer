# Places analysis JSON export - Traceability

| Requirement | Acceptance criterion | Ticket | Test or check | Evidence | Status |
| --- | --- | --- | --- | --- | --- |
| `REQ-001` | `AC-001` | `TASK-01` | focused source tests + PostgreSQL test defined | local verification | Verified |
| `REQ-002` | `AC-002` | `TASK-04` | target table tests | 32-test exporter file | Verified |
| `REQ-003` | `AC-003` | `TASK-01` | force/ceiling tests | 32-test exporter file | Verified |
| `REQ-004` | command contract | `TASK-04` | argument tests | 32-test exporter file | Verified |
| `REQ-005` | `AC-004` | `TASK-02` | strict schema tests | 32-test exporter file | Verified |
| `REQ-006` | `AC-005` | `TASK-01` | text-fidelity tests | 32-test exporter file | Verified |
| `REQ-007` | `AC-005` | `TASK-02` | extraction/preservation tests | 32-test exporter file | Verified |
| `REQ-008` | `AC-006` | `TASK-01` | ordering tests | unit pass; PostgreSQL case defined | Verified |
| `REQ-009` | `AC-007` | `TASK-02` | invalid-document table tests | 11 forbidden fields plus invariants | Verified |
| `REQ-010` | `AC-008` | `TASK-03` | filesystem safety tests | traversal/junction/atomic/cleanup pass | Verified |
| `REQ-011` | `AC-009` | `TASK-03` | partition test | autonomous-parts test pass | Verified |
| `REQ-012` | `AC-010` | `TASK-04` | sanitizer and CLI smoke | no sensitive output | Verified |
| `REQ-013` | `AC-011` | `TASK-04` | preflight and environment gate | explicit target missing; no file fabricated | Verified with environment gate |
