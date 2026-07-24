# Change record — Close Phase F, prepare Phase G

- Date: 24 July 2026
- Branch: `claude/close-phase-f-prepare-phase-g` (from latest `develop`)
- VibeSpec route: **Patch** (documentation only)
- Reference commits: PR #32 merge `216b97527bc091d6ffe24925ab3463f7d1f0f1c6`; docs status `4e58a303701fa50284560b83ed41ff17b6401790`

## Intent

Formally close **Phase F — Places metadata-first domain** after a successful real
local validation of the Places pipeline, and mark **Phase G — Places 2D UI and
contextual navigation** as `READY`. No application code is changed and no Phase G
implementation is started.

## Route justification

Localized, easily reversible, documentation-only; no public contract, persistent
data, security or deployment-model change. Failure impact is limited to documentation
accuracy. Per `.vibespec/bundle/core/change-routing.md`, this is a Patch.

## What changed

- `docs/HANDOFF.md`: reference commit → `216b975`; PR #32 added to completed work and
  merge proof; execution pointer, exit-gate section (§7), phase table (§8), open
  decisions (§9) and the exit-gate decision record (§10) updated; `PILOT_BLOCKED_BY_ENV`
  removed; Phase F → COMPLETE, Phase G → READY.
- `docs/IMPLEMENTATION_STATUS.md`: Phase F → COMPLETE, Phase G → READY; execution
  pointer and next-action updated; pilot-pending language removed.
- `docs/phase-g-places-2d-ui-brief.md` (new): Phase G entry brief referencing the
  authoritative contract (`CODEX_IMPLEMENTATION_ORDER.md` §5 + `CODEX_PLACES_EXTENSION.md`
  §13–§14), recording the entry gate, reusable surface, phase boundaries, flagged
  ambiguities and open product decisions.
- `docs/changes/2026-07-24-close-phase-f-prepare-phase-g.md` (this record).

Not changed: `docs/CODEX_IMPLEMENTATION_ORDER.md` (static plan/gates; carries no per-phase
status; no inconsistency found). No `src/**`, `app/**`, `components/**`,
`prisma/schema.prisma`, `package.json` or `package-lock.json` change.

## Phase F exit-gate evidence (recorded)

F1/F2/F3 and the hardening PR #32 are merged on `develop`. Cloud validation was green
with Geoapify mocked. The owner reported a successful real local validation (real DB,
development-only Geoapify key, real local JSONL): real import succeeded; an identical
re-import stayed idempotent with no unwanted duplicates; the expected P2002 no longer
appears; Geoapify retries recovered transient errors; `UNKNOWN` was handled correctly;
`Place`/`PostPlace`/`PlaceEvidence` persistence is coherent; no additional migration;
no public-contract break; no sensitive data (secrets, captions, JSONL, production data)
committed.

## Phase G source of truth

`docs/phase-g-places-2d-ui-brief.md` → `CODEX_IMPLEMENTATION_ORDER.md` §5 Phase G (scope
and exit gate) and `CODEX_PLACES_EXTENSION.md` §13–§14 (UI/UX and stats contract). A
complete brief already exists and was not rewritten.

## Verification

- `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build` (repository rule).
- Documentation-consistency checks: phase states identical between `HANDOFF.md` and
  `IMPLEMENTATION_STATUS.md`; commit/PR references correct; no code, secret, caption,
  JSONL or production data in the diff.

## Next action

Await an explicit Phase G prompt, then create `claude/phase-g-places-2d-ui` from the
latest `develop` and resolve the open product decisions with the owner before writing
UI code. Do not start Phase G in this change.
