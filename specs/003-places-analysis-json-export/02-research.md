# Places analysis JSON export - Research and Evidence

## Research questions

1. Which existing functions own eligibility, owner scope, and input identity?
2. Can the new output remain a local Phase F adapter?
3. How can target selection and filesystem writes fail closed?
4. Which tests provide the smallest sufficient safety proof?

## Evidence ledger

| Evidence | Finding |
| --- | --- |
| `src/server/places/caption-batch.ts` | Existing exporter already composes canonical eligibility, owner-scoped inputs, hashing, versioning, and force behavior. |
| `src/server/places/repository.ts` | Owner-scoped post/tag/media read and Instagram location extraction are authoritative. |
| `src/lib/places/candidates.ts` | Candidate output is strict text-only JSONL with five candidates maximum. |
| `.gitignore` | `.tmp/` is ignored. |
| `docs/IMPLEMENTATION_STATUS.md` | Phase F is complete; H and worker activation remain blocked. |

## Existing repository findings

- The current exporter defaults to 100, caps at 1,000, scans at most 2,000
  non-null themes, emits JSONL, omits mentions, and writes non-atomically.
- It orders by saved date then id but does not place canonical theme first.
- The local environment has `DATABASE_URL`, but no explicit develop/production
  target variable. Hostname inference is forbidden.
- Existing PostgreSQL tests already cover force behavior, eligibility, input
  identity, stale rejection, and owner-scoped repository inputs.

## Alternatives

| Option | Strengths | Costs and risks | Decision |
| --- | --- | --- | --- |
| Separate exporter reimplementing queries | Isolated | Duplicates critical rules and drifts | Rejected |
| Extend existing JSONL format only | Small diff | Does not deliver one strict artifact | Rejected |
| Compose a new JSON service over `exportCaptionBatch` | Reuses invariants, small boundary | Requires careful ordering and filesystem safety | Selected |

## Selected approach

Extend the existing export service only where complete pagination and ordering
are required, then compose a strict analysis-document service and a thin CLI.
Keep database reads in `src/server`, pure contract validation beside the service,
and all target/environment selection in the CLI boundary.

## Remaining unknowns

The explicit production database URL is not present locally, so real production
counts and file generation remain environment-gated.
