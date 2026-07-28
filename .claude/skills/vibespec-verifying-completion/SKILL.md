---
name: vibespec-verifying-completion
description: Use when preparing to state that a task, bug fix, feature, migration, refactor, build, test suite, or release step is complete or correct.
---

# Verifying Completion

## Gate

No completion claim without fresh evidence.

1. Identify the command or observation proving each claim.
2. Run the full command now.
3. Read exit status, failures, warnings, and skipped checks.
4. Compare results with acceptance criteria and traceability.
5. State only what the evidence proves.

Typical evidence includes the original reproduction, focused tests, full relevant suite, type checks, lint, build/package checks, migration dry-run, security scans, and runtime smoke tests.

Use `templates/verification-report.md` from the active VibeSpec root. List unverified areas and environmental limitations explicitly.

A passing linter does not prove a build. A passing unit test does not prove the original bug. Previous command output is not fresh verification.

