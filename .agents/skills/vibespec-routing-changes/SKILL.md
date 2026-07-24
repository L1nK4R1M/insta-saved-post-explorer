---
name: vibespec-routing-changes
description: Use when beginning a software change, bug fix, refactor, migration, or technical investigation before deciding process depth.
---

# Routing Changes

## Core rule

Choose the smallest mode that safely contains the change: Patch, Standard, or Critical.

## Method

1. Inspect the request and known repository context.
2. Evaluate blast radius, reversibility, uncertainty, and consequence.
3. Read `core/change-routing.md` from the active VibeSpec root only when classification is not obvious.
4. State the selected mode and one-sentence reason.
5. Escalate during discovery when hidden risk appears. De-escalate only with evidence.

## Quick reference

| Signal | Route |
|---|---|
| Local, reversible, no contract or data risk | Patch |
| New behavior or multiple boundaries | Standard |
| Security, data migration, public compatibility, major outage risk | Critical |

## Common mistakes

- Routing by line count instead of consequence.
- Treating a schema change as Patch because the code diff is small.
- Keeping Critical after discovery proves the change is isolated, creating needless process.

