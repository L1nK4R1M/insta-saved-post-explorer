# Document Lifecycle

## Durable documents

- Project context and glossary.
- Architecture decisions.
- Public contracts and invariants.
- Operations and recovery procedures.

These describe the current system and must be updated when the system changes.

## Change documents

- Briefs, specifications, task files, traceability matrices, risk registers, verification reports, and handoffs.

These live under the configured change directory and remain as evidence. Mark superseded content explicitly rather than silently rewriting history.

## Creation rule

Create a document only when its information cannot live clearly in an existing required artifact. Critical mode does not require an ADR unless a decision is costly to reverse, non-obvious, and based on a real trade-off.
