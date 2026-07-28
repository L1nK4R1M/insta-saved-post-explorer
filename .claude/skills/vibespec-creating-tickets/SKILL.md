---
name: vibespec-creating-tickets
description: Use when an approved plan or specification must be divided into independently implementable work with explicit dependencies and acceptance criteria.
---

# Creating Tickets

## Core pattern

Create vertical tracer slices, not layer-by-layer tasks.

Each ticket must:

- Deliver a narrow but complete observable behavior.
- Fit in one fresh agent context.
- Declare blocking tickets.
- Reference requirement identifiers.
- Define acceptance criteria and verification commands or methods.
- Avoid speculative implementation details that will become stale.

Use expand-migrate-contract for wide compatibility refactors that cannot remain green as one vertical slice.

## Ordering

Work the dependency frontier. A ticket can start when all blockers are complete. Separate unrelated tasks so fresh agents can execute them independently.

## Common mistakes

- Separate database, API, UI, and test tickets for one behavior.
- Oversized tickets described as phases.
- Hidden dependencies discovered only during implementation.

