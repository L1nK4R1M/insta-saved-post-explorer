# Claude Code Repository Instructions

@AGENTS.md
@docs/HANDOFF.md
@docs/IMPLEMENTATION_STATUS.md
@.claude/skills/vibespec-pro/SKILL.md

## Execution Rules

Read every imported file before inspecting or modifying implementation code.

- Work only on the active phase declared in `docs/HANDOFF.md`.
- Start from the latest `develop` branch and create the branch named by the handoff.
- Verify the active phase entry gate before editing files.
- List the exact files and tests planned before implementation.
- Keep each pull request limited to one phase or one coherent documentation change.
- Never implement a later phase because its brief is already present in the repository.
- Never bypass a blocked gate with provisional code, a second service, or duplicated infrastructure.
- Run fresh validation commands. Historical results in documentation are context, not current proof.
- Update `docs/HANDOFF.md` and `docs/IMPLEMENTATION_STATUS.md` when a phase is merged or its state changes.
- Stop for review after the active phase exit gate is proven. Do not continue automatically to the next phase.

## Required Completion Report

Every implementation pull request must report:

```text
Phase active
Gate d’entrée vérifiée
Fichiers modifiés
Contrats ajoutés ou modifiés
Migrations
Tests ajoutés
Commandes exécutées
Résultats
Risques restants
Prochaine gate
```

If the code, handoff, and phase documents disagree, stop and document the conflict instead of choosing a new architecture.

<!-- BEGIN VIBESPEC CLOUD -->
# VibeSpec Pro Cloud Bundle

Use the repository-managed VibeSpec skills for software changes.

Before implementation:
1. Read `.vibespec/project.yaml` when present.
2. Treat `.vibespec/bundle` as the active VibeSpec root.
3. Route the change as Patch, Standard, or Critical.
4. Load only the skills, profiles, and templates needed for the selected route.

Never claim completion without fresh verification evidence. Never commit, push, deploy, migrate, or run destructive operations unless explicitly authorized. Repository-specific instructions outside this managed block override these defaults.
<!-- END VIBESPEC CLOUD -->
