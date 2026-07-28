# Places address contract - Convergence review

Decision: PASS for develop PR readiness

## Artifact consistency

Specification, design, strict candidate schema, export v3 contract, Geoapify
adapter, scoring rules, tests, durable documentation, rollout, rollback, and
traceability describe the same address-first flow.

## Requirement coverage

Every `REQ-001` through `REQ-009` and `NFR-001` through `NFR-004` maps to an
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

## Environment gates

No live Geoapify call, Preview deployment, or candidate import is claimed.
These are release gates after the PR reaches `develop`. Production remains
blocked pending Preview evidence and explicit owner approval.

## Final decision rationale

PASS means the revision is coherent and locally ready for review/CI on
`develop`; it is not authorization to promote or re-analyze Production data.
