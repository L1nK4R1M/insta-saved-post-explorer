# Places address contract - Convergence review

Decision: PENDING follow-up verification; Production gate remains blocked

## Artifact consistency

Specification, design, strict candidate schema, export v3 contract, Geoapify
adapter, scoring rules, tests, durable documentation, rollout, rollback, and
traceability describe the same address-first flow.

## Requirement coverage

Every `REQ-001` through `REQ-011` and `NFR-001` through `NFR-004` maps to an
existing test seam or an inspectable no-change check. Uncovered requirements: 0.

## Implementation against specification

The separate fixed-diff compliance review found no missing, partial, incorrect,
or unrequested behavior. Old addressless JSONL is intentionally rejected, while
`address: null` preserves addressless candidate behavior.

## Engineering quality and safety

The separate fixed-diff engineering review found no blocker, high, medium, or
low finding inside the change. Address-authorized exactness is gated by textual
agreement, matching house number, provider specificity, provider rank, provider
match type, threshold, and contradiction checks. No model coordinate is accepted.

## Verification

- focused: 92 passed, 24 environment-bound PostgreSQL skips;
- full Vitest: 370 passed, 130 environment-bound skips;
- Prisma generation, lint, typecheck, build (32 routes/pages), and
  `git diff --check`: PASS;
- original hungryconsti-shaped deterministic regression: `EXACT`, confidence
  0.96, radius null;
- different house number and city-only provider regressions: safe non-exact and
  10 km approximate outcomes.

## Environment evidence and remaining gate

- PR #52 is merged on `develop` at `71106cc`.
- GitHub CI #153 passed.
- Vercel Preview deployment `dpl_632ZKgw3HdT6XwuCfynP3RQkBZBc` is READY and
  its immutable URL returns HTTP 200.
- The single real post exported from Neon develop under schema v3 with
  `business_writes=false`; the temporary export was then removed.
- The owner authorized the live Geoapify dry-run. It returned `amenity`, rank 1,
  `inner_part`; the refined scorer returns `EXACT`, confidence 1, radius null.
- The importer printed a clean 1/1 success report, exited 0 after lifecycle
  correction, and Neon develop retained its original one approximate primary,
  proving that no dry-run write escaped.
- The follow-up scoring, supersession and shutdown diff still requires full
  gates, PostgreSQL CI, independent review and READY Preview evidence.

## Final decision rationale

The decision returns to PASS only after the follow-up satisfies every local and
hosted gate. No current evidence authorizes a committed re-analysis or
Production promotion.
