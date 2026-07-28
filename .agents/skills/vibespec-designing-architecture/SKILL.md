---
name: vibespec-designing-architecture
description: Use when a change introduces or alters module boundaries, public contracts, persistence, concurrency, integrations, deployment topology, or difficult-to-reverse technical decisions.
---

# Designing Architecture

## Goal

Choose boundaries that hide complexity behind small, stable interfaces.

## Design steps

1. Start from required behavior and existing architecture.
2. Identify modules, ownership, dependencies, and public seams.
3. Define data flow, failure flow, consistency, and recovery.
4. Compare at least two viable designs when the choice is consequential.
5. Prefer the least complex design meeting measured requirements.
6. Record contracts and invariants in dedicated documents.
7. Create an ADR only when the decision meets the ADR threshold.

Critical designs must include threat or hazard considerations, rollout stages, rollback, observability, and compatibility.

## Review questions

- Can a consumer use the module without reading its internals?
- Can internals change without breaking consumers?
- Is state ownership unambiguous?
- Can failure be detected and recovered?

