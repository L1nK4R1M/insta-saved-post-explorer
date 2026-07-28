# Places mobile usability - Validation

## Focused evidence

```text
npx vitest run tests/unit/places-actions.test.ts tests/unit/places-scoring.test.ts tests/unit/places-view-switch.test.tsx
npx playwright test tests/e2e/places.spec.ts tests/e2e/places-globe.spec.ts --project=mobile
```

## Repository gates

```text
npm run lint
npm run typecheck
npm run test
npm run build
git diff --check
git status --short
```

## Evidence ledger

| Evidence | Result |
| --- | --- |
| RED focused run | 4 expected failures |
| GREEN focused Vitest | 29 passed |
| Desktop Places E2E | 6 passed |
| Mobile Places E2E | 1 passed with exact bounds |
| Lint and typecheck | PASS |
| Full Vitest | 360 passed, 130 environment-bound skipped |
| Production build | PASS, 32 pages |
| Spec-compliance review | PASS |
| Code-quality/security review | PASS |

See `evidence/2026-07-28-local-verification.md`.

## Release evidence

Pending GitHub CI/merge, Vercel Production readiness and Neon backup/transaction
evidence. These checks are not represented as complete before execution.
