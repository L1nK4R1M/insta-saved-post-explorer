---
name: vibespec-preflight
description: Use when a request may change source code, tests, architecture, schemas, dependencies, CI, infrastructure, or implementation documentation, before any planning or editing happens.
---

# VibeSpec Preflight

## Core rule

Preflight runs first and fails closed. Emit the report below before planning or editing. When the status is BLOCKED, stop and report the code instead of continuing.

## Method

1. Identify the project from `.vibespec/project.yaml` when present, otherwise from the repository directory name.
2. Read that configuration. A missing file is degraded mode with a warning, not a failure, unless project instructions require it.
3. Note the active agent and the active VibeSpec root when detectable.
4. Apply `vibespec-routing-changes` to select Patch, Standard, or Critical. Do not restate its rules here.
5. List the skills and quality gates that the selected route requires.
6. Emit the report. Keep it short; it precedes every change.

## Output

```text
VIBESPEC PREFLIGHT
Project: <name>
Route: Patch | Standard | Critical
Risk: Low | Medium | High

Required skills:
- <skill name>

Required gates:
- <gate name>

Status: READY
```

Blocked form:

```text
VIBESPEC PREFLIGHT
Status: BLOCKED
Code: <code>
Reason: <one line>
```

## Codes

| Code | Meaning |
|---|---|
| `VIBESPEC_PREFLIGHT_READY` | Preconditions satisfied |
| `VIBESPEC_PROJECT_CONFIG_MISSING` | Warning; degraded mode |
| `VIBESPEC_PROJECT_CONFIG_INVALID` | Blocking; configuration unreadable |
| `VIBESPEC_ROUTE_UNRESOLVED` | Blocking; classification impossible |
| `VIBESPEC_SKILL_UNAVAILABLE` | Blocking; a required skill is absent |
| `VIBESPEC_VERIFICATION_COMMAND_MISSING` | Blocking for Standard and Critical |

## Common mistakes

- Planning or editing before the report exists.
- Duplicating routing or verification rules instead of loading those skills.
- Reporting READY without naming the route, the skills, and the gates.
- Treating a legacy project without configuration as a hard failure.

Read `docs/preflight.md` in the active VibeSpec root for the full contract.
