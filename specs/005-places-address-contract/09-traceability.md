# Places address contract - Traceability

| Requirement | Acceptance criterion | Ticket | Test or check | Evidence | Status |
|---|---|---|---|---|---|
| `REQ-001` | `AC-001` | `TASK-01` | candidate schema + JSON Schema alignment tests | local verification | Verified |
| `REQ-002` | `AC-001` | `TASK-01` | export v3 exact-contract test | local verification | Verified |
| `REQ-003` | `AC-002` | `TASK-02` | address URL and addressless structured URL tests | local verification | Verified |
| `REQ-004` | `AC-003` | `TASK-02` | Geoapify normalization test | local verification | Verified |
| `REQ-005` | `AC-003` | `TASK-03` | hungryconsti exact + provider gate table | local verification | Verified |
| `REQ-006` | `AC-004` | `TASK-03` | conflicting house number with shared 1000 postcode | local verification | Verified |
| `REQ-007` | `AC-005` | `TASK-03` | city-only address candidate remains 10 km | local verification | Verified |
| `REQ-008` | `AC-006` | `TASK-01` | places-v2 constant, hash identity test, PostgreSQL export test defined | local verification | Verified |
| `REQ-009` | scope check | `TASK-04` | no migration/data command; diff inspection | both reviews | Verified |
| `REQ-010` | `AC-010` | `TASK-05` | real Windows dry-run exits 0 after Prisma disconnect | develop runtime evidence | In progress |
| `REQ-011` | `AC-009` | `TASK-05` | PostgreSQL exact supersession + confirmed-link preservation test | CI PostgreSQL suite | In progress |
| `NFR-001` | `AC-001` | `TASK-01` | strict/bounded rejection tests | local verification | Verified |
| `NFR-002` | `AC-002` | `TASK-02` | existing retry/limit suite | full Vitest | Verified |
| `NFR-003` | `AC-002` | `TASK-02` | URL/error no-leak tests + diff review | engineering review | Verified |
| `NFR-004` | `AC-007` | `TASK-04` | focused/full/lint/typecheck/build/diff check | local verification | Verified |

Uncovered requirements: 0
