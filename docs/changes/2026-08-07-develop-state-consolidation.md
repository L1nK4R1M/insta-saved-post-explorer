# develop state consolidation — 7 August 2026

Status: documentation only. No product code, contract, schema, dependency,
migration or CI change.

## Why

`docs/HANDOFF.md` and `docs/IMPLEMENTATION_STATUS.md` had drifted from the
repository. They named `develop` at `71106cc` / `f98da30` while it was at
`0a933a1`, and they were silent about five things that had actually happened.
`CLAUDE.md` requires both files to track phase state, so the drift was itself a
defect.

## What was unrecorded

| Fact | Where it now lives |
|---|---|
| `626aee5` and `0a933a1` were pushed directly to `develop` without a PR on 1 August 2026, against `AGENTS.md` §8 | `HANDOFF.md` §2 and §3, `IMPLEMENTATION_STATUS.md` status table |
| Specs `007` and `008` exist and converged `PASS` | both files |
| Spec `006` (Places v5 international addresses) is drafted with convergence `PENDING` and is blocked | both files |
| `main` had the standardized CI since PR #56 and `develop` did not — the branches validated differently | `HANDOFF.md` §3 |
| The MapLibre renderer is merged, not an unmerged working tree | `HANDOFF.md` §9, `IMPLEMENTATION_STATUS.md`, `2026-08-03-maplibre-2d-renderer.md` |

`HANDOFF.md` §8 also listed the same instruction twice, as items 3 and 4. The
duplicate is removed.

## Decisions recorded

**Do not back-merge `main` into `develop`.** A trial `git merge origin/main` was
run and rejected. The merge base is `67e3c1b` (PR #46), so every Production squash
since — `66cfd78`, `8dbfd46`, `bebf680` — reads as new work on `main`. The merge
produced four conflicts, two of which would have re-applied the
pre-address-contract `places-scoring.test.ts` and `places-actions.test.ts` over
the work merged by PR #52/#54. PR #59 cherry-picks the three CI commits instead.
`git diff origin/main origin/develop -- .github/ scripts/ci/ next-env.d.ts` is now
empty.

**`bb77f56` is not optional.** `scripts/ci/check.sh` fails the job when validation
modifies repository state, and `develop` shipped the `.next/dev/types` variant of
`next-env.d.ts`, so every `npm run build` dirtied the tree.

**The MapLibre D6 FPS budget is derogated, not met.** Recorded in full in
`HANDOFF.md` §7: what is proven, what is not, the three Chromium configurations
probed on the paravirtualized virtio GPU that all land on SwiftShader, the exact
procedure to close it, and the accepted risk that a real frame-rate regression
would go uncaught until then.

## Verification

| Gate | Result |
|---|---|
| `eslint . --max-warnings=0` | PASS — exit 0 |
| `npm run typecheck` | PASS |
| `npm run test` | PASS — 369 passed, 132 environment-bound skips |
| `npm run build` | PASS |
| `check.sh` state guard | PASS |
| `git diff --check` | PASS |

## Limits

The 132 skips are the PostgreSQL suites; they need `TEST_DATABASE_URL` and are not
counted as executed. The worker PostgreSQL invariants, the worker smoke and the
Docker container contract are not runnable in the agent environment; CI runs them.
