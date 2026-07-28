---
name: vibespec-developing-with-tdd
description: Use when implementing a feature, fixing a reproducible defect, refactoring behavior, or changing a public contract where an automated feedback seam exists.
---

# Developing with TDD

## Cycle

1. Select one observable behavior at a public seam.
2. Write the smallest test that expresses it.
3. Run the test and confirm it fails for the expected missing or broken behavior.
4. Write only enough implementation to pass.
5. Run the focused test and relevant neighboring tests.
6. Refactor while keeping tests green.
7. Repeat with the next behavior.

## Test quality

Prefer real behavior over internal mocks. A test should survive implementation refactoring. Expected values must come from the specification, a worked example, or another independent source.

When no correct automated seam exists, document the limitation and create the tightest reproducible harness available. Do not add a misleading shallow test.

## Red flags

- Production behavior written before the failing test without an approved exception.
- Tests that assert private calls or reproduce implementation logic.
- Large batches of imagined tests before any implementation feedback.

