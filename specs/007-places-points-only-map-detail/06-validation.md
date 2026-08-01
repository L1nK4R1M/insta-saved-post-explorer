# Validation

## Local evidence (2026-08-01)

- `npm run lint`: PASS.
- `npm run typecheck`: PASS.
- `npm run test -- --run`: PASS, 373 tests passed and 132 environment-bound tests skipped.
- `npm run build`: PASS with Next.js 16.2.11, 32 routes generated.
- Places Chromium E2E: PASS, 12 tests.
- `npm audit`: PASS, zero known vulnerabilities after the targeted dependency updates.
- `git diff --check`: PASS.

## Preview gate

After the Develop push and Preview deployment, verify an exact point with multiple linked posts, caption selection, Instagram link, and that approximate places stay absent from the 2D/3D canvas while remaining available in list/review.
