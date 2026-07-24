---
name: vibespec-reviewing-changes
description: Use when a diff, branch, pull request, completed ticket, or work-in-progress change needs independent assessment against requirements and engineering standards.
---

# Reviewing Changes

Run two separate axes from the same fixed diff point.

## Spec compliance

Report:

- Missing or partial requirements.
- Incorrect behavior.
- Unrequested behavior and scope creep.
- Acceptance criteria without evidence.

Reference requirement identifiers and relevant diff locations.

## Engineering quality

Report:

- Violations of repository standards.
- Correctness, security, reliability, performance, and maintainability risks.
- Poor boundaries, duplication, hidden coupling, and weak tests.
- Operational or migration hazards.

Keep hard violations separate from judgment calls. Do not let elegant code hide a spec failure or complete behavior hide a quality failure. Rank findings within each axis by severity.

