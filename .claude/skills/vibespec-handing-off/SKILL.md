---
name: vibespec-handing-off
description: Use when work will continue in another session, model, agent, repository, or human review and the next worker needs compact reliable state.
---

# Handing Off

Use `templates/handoff.md` from the active VibeSpec root and keep it compact.

Include:

- Goal and selected change mode.
- Current verified state.
- Completed and remaining tickets.
- Decisions and relevant source paths.
- Commands run and their outcomes.
- Known failures, risks, and unverified areas.
- Exact next action and its prerequisites.
- Uncommitted or unrelated working-tree changes that must be preserved.

Reference source files instead of copying long specs, logs, or code. A handoff is a navigation map, not a transcript.

