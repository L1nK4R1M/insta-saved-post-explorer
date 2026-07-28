---
name: vibespec-pro
description: >
  Mandatory repository-managed specification-first workflow for all software
  changes, including features, fixes, refactors, migrations, audits, and
  phase-gated implementation.
---

# VibeSpec Pro

1. Read `.vibespec/project.yaml`.
2. Treat `.vibespec/bundle` as the authoritative VibeSpec installation.
3. Load the router, selected route skill, project profiles, templates, and
   verification rules from that bundle.
4. Follow the repository phase gates in `AGENTS.md`,
   `docs/HANDOFF.md`, and `docs/CODEX_IMPLEMENTATION_ORDER.md`.
5. Produce the mandatory preflight before implementation.
6. Produce fresh verification evidence before declaring completion.

If the authoritative bundle cannot be loaded, return:

`VIBESPEC_SKILL_NOT_LOADED`
