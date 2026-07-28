# Traceability Matrix

Generated from `01-spec.md`, `05-tasks.md`, and `06-validation.md`.

| Requirement | Summary | Tasks | Acceptance tests | Evidence IDs | Coverage |
|---|---|---|---|---|---|
| FR-001 | Web synchronization uses only the owner-scoped DB identities supplied by the session | TASK-001, TASK-002, TASK-004 | AT-001, AT-002 | EV-001, EV-002, EV-003, EV-006, EV-007 | Covered |
| FR-002 | Archive identities absent from the web-session DB snapshot become durable targets | TASK-001, TASK-002, TASK-004 | AT-001, AT-005 | EV-001, EV-002, EV-003, EV-006, EV-007 | Covered |
| FR-003 | A website-known post does not stop the scan while a reconciliation | TASK-001, TASK-002, TASK-003, TASK-004 | AT-001, AT-002, AT-006 | EV-001, EV-002, EV-003, EV-004, EV-005, EV-006, EV-007 | Covered |
| FR-004 | Local extension-only incremental exports continue to stop on the | TASK-002, TASK-003, TASK-004 | AT-003, AT-006 | EV-001, EV-002, EV-003, EV-004, EV-005, EV-006, EV-007 | Covered |
| FR-005 | A web sync with residual targets at feed completion fails with the | TASK-002, TASK-004 | AT-004 | EV-002, EV-003, EV-006, EV-007 | Covered |
| FR-006 | Target resolution commits only after every selected post on the page | TASK-002, TASK-004 | AT-005 | EV-002, EV-003, EV-006, EV-007 | Covered |
| FR-007 | The corrected extension is version 4.2.6 and web recovery copy asks | TASK-003, TASK-004, TASK-005, TASK-007, TASK-008 | AT-006, AT-009 | EV-001, EV-002, EV-003, EV-004, EV-005, EV-006, EV-007, EV-008, EV-010, EV-011, EV-012 | Covered |
| FR-008 | A repeated requested cursor is terminal | TASK-005 | AT-007 | EV-008 | Covered |
| FR-009 | The web UI observes the durable server job as a terminal fallback | TASK-006 | AT-008 | EV-009 | Covered |
| FR-010 | The exact stable develop Preview origin is present at all three extension gates | TASK-007 | AT-009 | EV-010, EV-011 | Covered |
| FR-011 | Duplicate running states do not refresh the no-progress watchdog | TASK-008 | AT-010 | EV-012 | Covered |
| FR-012 | Sync sessions pair owner-scoped DB external IDs and post codes | TASK-008 | AT-011 | EV-012 | Covered |
| FR-013 | Successful web sync aligns the extension archive to the DB snapshot and accepted rows | TASK-008 | AT-011 | EV-012 | Covered |
| NFR-001 | A healthy web sync with no archive gap stops at the first web-known | TASK-002, TASK-004 | AT-002 | EV-002, EV-003, EV-006, EV-007 | Covered |
| NFR-002 | Reconciliation targets persist in the durable MV3 task and survive a | TASK-002, TASK-004 | AT-005 | EV-002, EV-003, EV-006, EV-007 | Covered |
| NFR-003 | No Prisma schema, migration, API route, secret, R2 permission or dependency change | TASK-001, TASK-003, TASK-004, TASK-007 | AT-006, AT-009 | EV-001, EV-002, EV-003, EV-004, EV-005, EV-006, EV-007, EV-010 | Covered |
| NFR-004 | Focused policy tests, neighboring sync tests, syntax checks, lint, | TASK-003, TASK-004 | AT-006 | EV-001, EV-002, EV-003, EV-004, EV-005, EV-006, EV-007 | Covered |
| NFR-005 | Pagination makes progress or reaches a visible terminal state | TASK-005 | AT-007 | EV-008 | Covered |
| NFR-006 | Polling is bounded by terminal state or cleanup and settles once | TASK-006 | AT-008 | EV-009 | Covered |
| NFR-007 | No wildcard Vercel origin is trusted | TASK-007 | AT-009 | EV-010, EV-011 | Covered |
| NFR-008 | A non-sensitive monotonic work checkpoint distinguishes progress from transport liveness | TASK-008 | AT-010 | EV-012 | Covered |
| NFR-009 | Paired DB identities are additive and legacy session arrays remain accepted | TASK-008 | AT-011 | EV-012 | Covered |
| BR-001 | PostgreSQL and web-session state own imported identity and post-success archive alignment | TASK-001, TASK-002, TASK-004, TASK-008 | AT-001, AT-011 | EV-001, EV-002, EV-006, EV-007, EV-012 | Covered |
| BR-002 | Imports remain owner-scoped and idempotent | TASK-004 | AT-005 | EV-003, EV-006, EV-007 | Covered |
| BR-003 | Missing Instagram posts are not invented or silently removed | TASK-004 | AT-004 | EV-006, EV-007 | Covered |
| BR-004 | Target state advances atomically after a complete page | TASK-002, TASK-004 | AT-005 | EV-002, EV-003, EV-006, EV-007 | Covered |
| BR-005 | A repeated cursor is terminal and retains residual-target checks | TASK-005 | AT-007 | EV-008 | Covered |
| BR-006 | SyncJob is the durable fallback while extension messages carry progress | TASK-006 | AT-008 | EV-009 | Covered |
| BR-007 | Preview and Production remain isolated by environment-scoped database configuration | TASK-007 | AT-009 | EV-010 | Covered |
| BR-008 | Transport liveness is not task progress | TASK-008 | AT-010 | EV-012 | Covered |

Uncovered requirements: 0

This generated matrix checks references, not semantic correctness. Final convergence must inspect the implementation and evidence.
