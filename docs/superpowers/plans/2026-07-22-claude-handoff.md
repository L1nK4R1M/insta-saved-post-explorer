# Claude Handoff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a reliable Claude Code entry point and a living operational handoff without changing application behavior.

**Architecture:** Keep the existing briefs authoritative and add a thin navigation and status layer. `CLAUDE.md` loads the global rules and current handoff, while `HANDOFF.md` and `IMPLEMENTATION_STATUS.md` identify the active phase and its evidence requirements.

**Tech Stack:** Markdown, GitHub branches and pull requests, existing Next.js repository conventions.

## Global Constraints

- Documentation-only change.
- Target branch is `develop`.
- Use a dedicated branch named `docs/claude-handoff`.
- Do not modify TypeScript, Prisma schema, migrations, dependencies, environment variables, application behavior, worker code, or MCP code.
- Preserve the architecture of one Next.js application, one PostgreSQL database, one R2 storage, one global VPS worker, and one global MCP server.
- Phase A is the only next implementation phase.

---

### Task 1: Add Claude Code Entry Point

**Files:**
- Create: `CLAUDE.md`

**Interfaces:**
- Consumes: `AGENTS.md`, `docs/HANDOFF.md`, `docs/IMPLEMENTATION_STATUS.md`
- Produces: the repository-level instruction entry point loaded by Claude Code

- [ ] **Step 1: Create `CLAUDE.md`**

Add imports for the three authoritative handoff files and concise rules requiring one phase, one branch, fresh validation, and a review stop.

- [ ] **Step 2: Fetch the created file**

Verify the imports use exact repository paths and that no instruction conflicts with `AGENTS.md`.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add Claude Code entry point"
```

### Task 2: Add Operational Handoff and Status Ledger

**Files:**
- Create: `docs/HANDOFF.md`
- Create: `docs/IMPLEMENTATION_STATUS.md`

**Interfaces:**
- Consumes: `AGENTS.md`, `docs/api-places-phase-0-audit.md`, `docs/CODEX_IMPLEMENTATION_ORDER.md`, current `develop`
- Produces: active-phase state and a phase-by-phase progress index

- [ ] **Step 1: Create `docs/HANDOFF.md`**

Include:

- baseline and last completed documentation phase;
- Phase A as the only active next phase;
- exact defects in `getRandomLibraryPost()`, `getRandomRelevantPost()`, and `countRelevantPosts()`;
- allowed scope, expected tests, branch name, validation commands, and stop condition;
- blocked phases and decisions that require explicit user input.

- [ ] **Step 2: Create `docs/IMPLEMENTATION_STATUS.md`**

Add phase 0 and phases A through J with status, dependencies, branch or PR, and evidence columns. Mark phase 0 complete, Phase A ready, and every later phase blocked or not started.

- [ ] **Step 3: Fetch both files**

Verify no phase is marked complete without evidence and no later phase is presented as executable.

- [ ] **Step 4: Commit**

```bash
git add docs/HANDOFF.md docs/IMPLEMENTATION_STATUS.md
git commit -m "docs: add operational handoff and phase ledger"
```

### Task 3: Align Existing Agent Documentation

**Files:**
- Modify: `AGENTS.md`
- Modify: `README.md`
- Modify: `docs/CODEX_API_READY_ARCHITECTURE.md`

**Interfaces:**
- Consumes: the new handoff files from Tasks 1 and 2
- Produces: a consistent reading order, runtime requirement, and phase gate

- [ ] **Step 1: Update `AGENTS.md`**

Insert `docs/HANDOFF.md` and `docs/IMPLEMENTATION_STATUS.md` immediately after `AGENTS.md` in the mandatory reading order. Clarify that the handoff describes current state but cannot override the phase order or architecture briefs.

- [ ] **Step 2: Update `README.md`**

Change the Node.js requirement from 22 or later to Node.js 24.x, matching `package.json` and CI. Add a short contributor section linking to `CLAUDE.md` and `AGENTS.md`.

- [ ] **Step 3: Update the API brief execution protocol**

Replace the protocol that starts directly with `feat/external-api-v1` with a gate statement:

```text
Do not execute this brief until the prerequisite phases required by CODEX_IMPLEMENTATION_ORDER.md have been validated. This brief defines Phase D only and does not authorize combining Phase A, B, C, or D in one pull request.
```

Then retain only Phase D-specific implementation steps.

- [ ] **Step 4: Fetch every modified file**

Confirm only documentation changed and all links resolve to repository paths.

- [ ] **Step 5: Commit**

```bash
git add AGENTS.md README.md docs/CODEX_API_READY_ARCHITECTURE.md
git commit -m "docs: align agent handoff and phase gates"
```

### Task 4: Verify and Open Pull Request

**Files:**
- Review: all changed documentation files

**Interfaces:**
- Consumes: branch `docs/claude-handoff`
- Produces: reviewable pull request into `develop`

- [ ] **Step 1: Compare branch with `develop`**

Expected changed paths:

```text
AGENTS.md
CLAUDE.md
README.md
docs/CODEX_API_READY_ARCHITECTURE.md
docs/HANDOFF.md
docs/IMPLEMENTATION_STATUS.md
docs/superpowers/plans/2026-07-22-claude-handoff.md
docs/superpowers/specs/2026-07-22-claude-handoff-design.md
```

No source, schema, migration, dependency, environment, or workflow file may appear.

- [ ] **Step 2: Review the complete patch**

Check for placeholders, contradictory phase statuses, obsolete collection-based Places assumptions, accidental permission changes, and wording that could authorize implementation beyond Phase A.

- [ ] **Step 3: Open the pull request**

Use title:

```text
docs: add Claude handoff and execution state
```

The body must include scope, changed files, active phase, non-goals, validation, and the instruction that Phase A starts only in a separate pull request after this documentation PR is merged.

- [ ] **Step 4: Inspect PR checks**

Report GitHub Actions and Vercel status when available. Do not claim CI success before checks complete.
