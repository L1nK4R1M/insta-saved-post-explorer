---
name: vibespec-diagnosing-bugs
description: Use when behavior is broken, slow, flaky, inconsistent, crashing, or producing incorrect results and the root cause has not been demonstrated.
---

# Diagnosing Bugs

## Core rule

Build a tight red-capable feedback loop before selecting a fix.

## Sequence

1. Reproduce the user's exact symptom with a test, script, trace replay, request, browser harness, profiler, or minimal executable.
2. Make the signal deterministic and fast enough to iterate.
3. Minimize the reproduction while preserving failure.
4. Generate several ranked falsifiable hypotheses.
5. Instrument only where predictions differ. Change one variable at a time.
6. Add a regression test at the correct public seam when possible.
7. Apply the smallest root-cause fix.
8. Re-run the minimized and original scenarios.
9. Remove instrumentation and record the demonstrated cause.

Do not modify multiple suspected areas until evidence distinguishes them.

