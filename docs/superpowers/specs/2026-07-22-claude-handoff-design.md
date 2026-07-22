# Claude Handoff Design

Date: 22 July 2026  
Status: approved for implementation  
Target branch: `develop`

## 1. Goal

Make the repository self-sufficient for a new Claude Code session so Claude can resume the work started by Codex without reconstructing product intent, changing the locked architecture, or starting a later phase prematurely.

The handoff must answer five questions immediately:

1. What is the authoritative reading order?
2. What has actually been completed?
3. What is the next active phase?
4. Which files and defects belong to that phase?
5. Where must the agent stop for review?

## 2. Current Problem

The repository already contains detailed product and architecture briefs, but the immediate operational state is distributed across `AGENTS.md`, the phase-0 audit, implementation briefs, recent commits, and pull request history.

Claude Code does not currently have a repository-level `CLAUDE.md` entry point. A new session could therefore miss the mandatory instructions unless the user manually asks it to read `AGENTS.md`.

The API brief also contains an execution protocol that can be misread as permission to start API work before the earlier gates in `CODEX_IMPLEMENTATION_ORDER.md` are complete.

## 3. Chosen Approach

Use a small, documentation-only handoff layer. Do not duplicate the complete architecture briefs.

### 3.1 `CLAUDE.md`

Create a short Claude Code entry point that imports:

- `AGENTS.md`;
- `docs/HANDOFF.md`;
- `docs/IMPLEMENTATION_STATUS.md`.

It must instruct Claude to work on one phase only, use a dedicated branch, preserve `develop`, and stop after producing the required proof.

### 3.2 `docs/HANDOFF.md`

Create a living operational handoff containing:

- the reference branch and baseline commit;
- the latest completed work;
- the active next phase;
- the exact known defects in `src/server/library.ts`;
- the expected branch, permitted files, tests, and stop condition;
- unresolved product or infrastructure decisions that must not be guessed.

The initial active phase is Phase A, library filter consistency. Places, API V1, the VPS worker, and MCP remain blocked.

### 3.3 `docs/IMPLEMENTATION_STATUS.md`

Create a compact phase ledger for phases 0 and A through J. Each row records status, dependencies, branch or PR, and required evidence. This is the state index, while `CODEX_IMPLEMENTATION_ORDER.md` remains the detailed contract.

### 3.4 Existing Documentation

Update:

- `AGENTS.md` so the handoff and status ledger are part of the mandatory reading order;
- `README.md` so the documented Node.js requirement matches `package.json` and CI, and so contributors can find the agent entry points;
- `docs/CODEX_API_READY_ARCHITECTURE.md` so its execution protocol explicitly defers to the authoritative phase order and cannot be used to combine Phase A with Phase D.

## 4. Authority and Data Flow

```text
Claude Code
  -> CLAUDE.md
     -> AGENTS.md
     -> docs/HANDOFF.md
     -> docs/IMPLEMENTATION_STATUS.md
     -> detailed phase documents
     -> code relevant to the active phase
```

Authority remains:

1. `AGENTS.md` for global rules and prohibitions;
2. `docs/HANDOFF.md` for the current operational state only;
3. `docs/CODEX_IMPLEMENTATION_ORDER.md` for phase order and gates;
4. the relevant implementation brief for detailed contracts;
5. existing code conventions.

`HANDOFF.md` must never override architecture or product invariants. It only points to the active work.

## 5. Initial Phase A Handoff

The handoff will identify these observed defects:

- `getRandomLibraryPost()` does not apply author, year, and collection filters;
- `getRandomRelevantPost()` does not apply author, year, and collection filters;
- `countRelevantPosts()` does not apply author, year, and collection filters while `queryRelevantPosts()` does.

Phase A must centralize or otherwise share the relevant predicates so list, count, and random paths operate on the same filter set. It must add PostgreSQL-backed regression tests. It must not implement API V1, Places eligibility, R2 identity, worker infrastructure, or MCP.

## 6. Non-Goals

This pull request must not:

- modify application behavior;
- modify TypeScript, Prisma schema, migrations, dependencies, or environment variables;
- implement Phase A;
- create API endpoints;
- add Places models or UI;
- create a worker or MCP server;
- choose map, geocoding, AI, or rate-limit providers.

## 7. Validation

Because the change is documentation-only, validation consists of:

- fetching every changed file from the branch after writes;
- comparing the branch against `develop`;
- reviewing the generated patch for accidental functional changes;
- checking that Markdown references point to existing repository paths;
- confirming CI and Vercel status on the pull request when available.

## 8. Acceptance Criteria

- `CLAUDE.md` exists at repository root and imports the authoritative handoff files.
- A new agent can identify Phase A as the only next implementation phase without reading pull request history.
- Phase A lists the exact three known filter inconsistencies and its stop condition.
- Phases B through J are explicitly blocked by their dependencies.
- The API brief cannot reasonably be interpreted as permission to bypass the phase order.
- The README and `package.json` agree on Node.js 24.
- No functional source, schema, migration, dependency, or environment file changes.
