---
name: vibespec-writing-specifications
description: Use when a Standard or Critical change needs explicit observable requirements, scope, acceptance criteria, constraints, and traceability before implementation.
---

# Writing Specifications

## Output contract

Use `templates/feature-spec.md` from the active VibeSpec root. Every requirement receives a stable identifier such as `REQ-001`.

A specification states:

- User or system problem.
- Observable outcomes.
- Functional requirements.
- Measurable non-functional requirements.
- Invariants and compatibility constraints.
- Error and edge-case behavior.
- Out of scope.
- Acceptance criteria and test seams.
- Assumptions and unresolved risks.

Describe what must be true, not a file-by-file implementation plan. Reference existing contracts rather than duplicating them.

## Quality check

Each requirement must be testable or have an explicit verification method. Remove duplicate requirements and vague words such as fast, robust, secure, or scalable unless quantified.

