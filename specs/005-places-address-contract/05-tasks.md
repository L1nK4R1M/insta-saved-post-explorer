# Places address contract - Tasks

## TASK-01 - Lock the untrusted address contract

**Mode:** critical  
**Status:** verified  
**Blocked by:** none

Deliver `REQ-001`, `REQ-002`, and `REQ-008` through strict schema, v3 export
declaration, and places-v2 identity tests.

## TASK-02 - Resolve the address through Geoapify

**Mode:** critical  
**Status:** verified
**Blocked by:** TASK-01 (satisfied)

Deliver `REQ-003` and `REQ-004` through address free-form query and provider
match-type normalization tests.

## TASK-03 - Score verified addresses conservatively

**Mode:** critical  
**Status:** verified
**Blocked by:** TASK-02 (satisfied)

Deliver `REQ-005` to `REQ-007` with the hungryconsti-shaped regression,
house-number contradiction, provider-evidence, city-area, and legacy tests.

## TASK-04 - Converge documentation and verification

**Mode:** critical  
**Status:** verified
**Blocked by:** TASK-03 (satisfied)

Update durable contracts/operator guidance, run focused and full gates, perform
separate specification and engineering-quality reviews, and record rollout,
rollback, observability, traceability, and remaining Production approval gate.

## TASK-05 - Close real develop validation gaps

**Mode:** critical
**Status:** in progress
**Blocked by:** explicit owner authorization for the single Geoapify dry-run (satisfied)

Deliver `REQ-010` and `REQ-011`, plus the real `inner_part` refinement of
`REQ-005`: prove the CLI exits cleanly, accept only strongly verified
`inner_part`, atomically supersede the previous automatic approximate primary,
preserve user-confirmed/history data, and rerun the complete gates.

## Exact expected implementation files

- `src/lib/places/candidates.ts`
- `src/lib/places/scoring.ts`
- `src/server/places/resolvers/types.ts`
- `src/server/places/resolvers/geoapify.ts`
- `src/server/places/analysis-json-export.ts`
- `src/server/places/analysis.ts`
- `src/server/places/jobs.ts`
- `scripts/places/import-candidate-batch.ts`
- `docs/places-caption-candidate.schema.json`
- `tests/unit/places-candidates.test.ts`
- `tests/unit/places-scoring.test.ts`
- `tests/unit/geoapify-resolver.test.ts`
- `tests/unit/places-analysis-json-export.test.ts`
- `tests/unit/places-analysis-postgres.test.ts`
- `tests/unit/places-caption-batch-postgres.test.ts`

No new test file is planned; existing seams cover every regression risk.
