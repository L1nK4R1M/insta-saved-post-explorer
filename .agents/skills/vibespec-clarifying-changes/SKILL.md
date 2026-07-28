---
name: vibespec-clarifying-changes
description: Use when a software request contains ambiguity that can materially alter behavior, scope, safety, architecture, compatibility, or acceptance criteria.
---

# Clarifying Changes

## Decision rule

Ask about decisions. Discover facts from the repository and tools.

## Process

1. List unresolved branches that materially change the result.
2. Order them by dependency and consequence.
3. Ask one focused question at a time and provide a recommended answer.
4. Capture each resolved decision in the active spec, contract, glossary, or ADR.
5. Stop when remaining uncertainty can be handled safely by documented assumptions.

Patch work should usually need zero or one clarification. Standard work may need a short decision pass. Critical work continues until safety, rollback, compatibility, and ownership are explicit.

## Avoid

- Asking the user for facts available in code or tools.
- Debating cosmetic details before core behavior.
- Turning clarification into an unlimited interview.

