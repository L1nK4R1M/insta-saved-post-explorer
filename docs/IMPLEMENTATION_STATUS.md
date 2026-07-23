# Implementation Status

Last updated: 23 July 2026

This file is a compact state ledger. Detailed scope, dependencies, and exit gates remain authoritative in `CODEX_IMPLEMENTATION_ORDER.md`.

Status values:

- `COMPLETE`: merged and supported by recorded proof;
- `READY`: entry gate is satisfied and the phase may start in a dedicated branch;
- `IN_PROGRESS`: active branch or pull request exists;
- `AWAITING_REVIEW`: implementation proof exists but the phase is not merged;
- `BLOCKED`: a required predecessor or decision is incomplete;
- `NOT_STARTED`: no implementation has begun, but the phase is not the next executable phase.

| Phase | Status | Dependencies | Branch / PR | Required or recorded evidence |
| --- | --- | --- | --- | --- |
| 0 — API and Places audit | COMPLETE | None | PR #15, merged into `develop` | Architecture, gaps, phase order, and Places eligibility documented. |
| A — Library filter consistency | COMPLETE | Phase 0 | PR #18, squash `69ea0da` | Shared Prisma/SQL predicates and 16 PostgreSQL regressions; lint, typecheck, tests and build green. |
| B — Places theme eligibility | COMPLETE | Phase A | PR #19, squash `2323e0d` | `PLACES_ELIGIBLE_THEMES`, `isPlacesEligibleTheme()`, 8 tests, no collection dependency. |
| E2e suite re-green | COMPLETE | — | PR #21, squash `1b5fa16` | Browser suite restored to green; 65 passed, 13 skipped, 0 failed at merge. |
| C — R2 media identity and worker isolation | COMPLETE | Reviewed design PR #23 | PR #24, squash `0870d69` | Additive migration, authoritative R2 identity, restricted role, backfill and PostgreSQL tests. |
| D — External API V1 | COMPLETE | Phase A | PR #26, squash `9e57f93` | Read-only Bearer API, stable errors, six thin routes and 21 tests. |
| E — Global worker foundation | READY | Phase C | None | Separate VPS phase. Do not mix with F. Requires VPS credential and deployment decisions. |
| F1 — Places schema and domain contracts | READY after design merge | Phases B and D; Phase F design | `docs/phase-f-claude-codex-handoff` documentation PR | Implement enums/models/migration, candidate/resolver/cursor contracts, idempotent metadata job creation and PostgreSQL tests. |
| F2 — Geoapify and caption resolution | BLOCKED | F1 merged | None | Geoapify resolver, deterministic scoring, local JSONL workflow, atomic persistence. |
| F3 — Read API, statistics, review | BLOCKED | F2 merged | None | Read-only `/api/v1/places*`, cursor queries, distinct statistics, review/merge services and final proof. |
| F — Places metadata-first domain | READY after design merge | Phases B and D | Design: `CODEX_PHASE_F_METADATA_FIRST_DESIGN.md`; plan: `docs/superpowers/plans/2026-07-23-phase-f-metadata-first.md` | Complete only after F1, F2, and F3 are merged with PostgreSQL, API and final e2e evidence. |
| G — Places 2D UI and contextual navigation | BLOCKED | Phase F | None | `/places`, map, filters, clusters, review UI, statistics, post deep links. |
| H — Deep Places analysis | BLOCKED | Phases C and E, stable F | None | FFmpeg, OCR, transcription, multimodal escalation, cleanup and measured pilot. |
| I — Places 3D globe | BLOCKED | Phase G | None | Shared data source with 2D map, synchronized selection, fly-to and accessibility. |
| J — Unified MCP and Hermes | BLOCKED | Phase D; Phase F for Places tools | None | One MCP server, shared API client, no DB/R2 access, confirmations for sensitive commands. |

## Current Execution Pointer

```text
Current state: Phases 0, A, B, C, D COMPLETE and merged. develop CI green.
Phase F dependencies are satisfied.

A documentation PR now proposes the reviewed Phase F design and task-level plan:
- Geoapify behind PlaceResolver;
- model output limited to textual candidates, never coordinates;
- local caption-only JSONL workflow without VPS or app-stored OAuth credentials;
- deterministic EXACT/PROBABLE/APPROXIMATE/UNKNOWN semantics;
- opaque cursor pagination;
- read-only external API boundary;
- sequential delivery as F1, F2, F3.

After that documentation PR merges, the only allowed next implementation is:
F1 — Places schema and domain contracts.

Claude owns implementation.
Codex owns independent review and verification.
Do not start F2 before F1 merges. Do not start F3 before F2 merges.
```

Do not change a phase or sub-phase to `COMPLETE` without adding its merged pull request and concrete validation evidence.
