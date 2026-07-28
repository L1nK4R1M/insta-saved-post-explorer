---
name: vibespec-discovering-codebases
description: Use when changing an existing repository and the current architecture, conventions, contracts, tests, or recent history are not yet understood.
---

# Discovering Codebases

## Goal

Build the smallest accurate map needed for the requested change.

## Explore

- Repository instructions and configuration.
- Relevant source modules and their callers.
- Existing tests at public seams.
- Durable contracts, schemas, ADRs, and domain terminology.
- Recent commits affecting the same area.
- Runtime, deployment, and failure constraints when relevant.

## Output

Record a concise discovery note containing:

- Current behavior and boundaries.
- Files or modules likely involved.
- Existing patterns to preserve.
- Risks, unknowns, and contradictions.
- Reusable tests or commands.

Do not inventory the entire repository. Stop when enough evidence exists to specify the change without guessing.

## Common mistakes

- Designing before reading existing code.
- Copying a fashionable architecture over established patterns.
- Reading every document and exhausting context.

