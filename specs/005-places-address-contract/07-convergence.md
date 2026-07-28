# Places address contract - Convergence review

Decision: PASS for develop integration; Production gate remains blocked

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

- original focused contract suite: 92 passed, 24 environment-bound PostgreSQL skips;
- follow-up focused scoring: 24 passed; PostgreSQL supersession executed in CI;
- follow-up full Vitest: 372 passed, 131 environment-bound local skips;
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
- PR #54 is squash-merged on `develop` at `f98da30`.
- CI #157 passed every job, including the ephemeral PostgreSQL supersession
  invariant, lint, types, unit tests, worker checks, build and Playwright.
- Vercel develop deployment `dpl_GWMGkdvQptBCz1icJidE6zUJM8vL` is READY and
  its immutable root returns HTTP 200.
- A fresh schema-v3 export and Geoapify dry-run from merged `develop` at
  `f98da30` processed 1/1 post, returned exit 0 and `committed=false`; Neon still
  has one approximate primary and zero exact links for the post afterward.
- Separate fixed-diff specification and engineering/safety follow-up reviews
  found no remaining issue.

## Final decision rationale

PASS means the code revision is coherent, merged, CI-green and Preview-ready on
`develop`. It does not authorize a committed re-analysis or Production
promotion; each remains a separate owner decision.
