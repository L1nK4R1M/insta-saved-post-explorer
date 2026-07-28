# Change Routing

Classify by blast radius, reversibility, uncertainty, and consequence.

## Patch

Use when all are true:

- Localized and easy to reverse.
- No public contract, persistent-data, security, or deployment-model change.
- Expected implementation is small and understood.
- Failure impact is limited.

Required: brief, one or more tasks, focused tests, verification evidence.

## Standard

Use when any are true:

- Multiple modules or layers change.
- New user-visible behavior is introduced.
- A new internal contract, dependency, job, screen, endpoint, or workflow appears.
- Important ambiguity or non-trivial test design exists.

Required: specification, vertical tasks, acceptance criteria, traceability, tests, review, verification.

## Critical

Use when any are true:

- Authentication, authorization, privacy, secrets, payments, safety, or compliance.
- Persistent-data migration or destructive operation.
- Public API or compatibility contract change.
- Broad architecture, concurrency, distributed systems, production infrastructure, or difficult rollback.
- Failure could cause major loss, outage, corruption, or security exposure.

Required: Standard artifacts plus architecture, risk analysis, rollback, explicit approval gates, and stronger verification.

When uncertain, choose the higher mode until discovery reduces uncertainty.
