---
name: vibespec-modeling-domains
description: Use when project terminology is ambiguous, overloaded, inconsistent with code, or important enough to define stable domain concepts and relationships.
---

# Modeling Domains

## Purpose

Maintain a precise shared language that survives across agents and sessions.

## Rules

- `CONTEXT.md` contains canonical terms, meanings, relationships, and invariants only.
- Do not place plans, progress, implementation notes, or task lists in the glossary.
- Challenge overloaded terms and contradictions with existing code.
- Test the model using concrete edge-case scenarios.
- Add an ADR only for a costly-to-reverse, surprising decision with real trade-offs.
- Split context by bounded domain when one glossary becomes difficult to navigate.

## Context economy

Read only the terms related to the touched behavior. Target fewer than 300 lines per bounded context. Prefer one canonical term over repeated explanations.

## Common mistakes

- Using the glossary as a PRD.
- Defining implementation classes instead of domain concepts.
- Recording every choice as an ADR.

