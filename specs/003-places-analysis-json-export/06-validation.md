# Places analysis JSON export - Validation

## Validation strategy

Use one compact new unit file for contract, CLI, filesystem, logging, and error
variants, plus targeted additions to the existing PostgreSQL caption-batch file
for real owner scope, ordering, force behavior, and unchanged business tables.

## Acceptance scenarios

- `AT-001`: Voyages and Restaurant export; neighboring and null themes do not.
- `AT-002`: already analyzed posts export in complete forced mode.
- `AT-003`: another owner's post is never exported.
- `AT-004`: captions, accents, newlines, emojis, hashtags, mentions, location,
  tags, author, hash, and version are preserved.
- `AT-005`: mixed themes and dates produce the specified deterministic order.
- `AT-006`: strict validation rejects duplicate ids, bad counts/hashes/versions,
  unknown fields, coordinate fields, and provider fields.
- `AT-007`: traversal, protected paths, and escaping symlinks fail.
- `AT-008`: success uses atomic rename; failure cleans the temporary file.
- `AT-009`: large output keeps the primary file and creates autonomous parts.
- `AT-010`: captured stdout/stderr contains no caption, DSN, key, or secret.
- `AT-011`: target selection never falls back to generic `DATABASE_URL`.
- `AT-012`: before/after PostgreSQL snapshots prove no business data changed.

## Quality commands

```text
npm ci
npm run db:generate
npx vitest run tests/unit/places-analysis-json-export.test.ts
npx vitest run tests/unit/places-caption-batch-postgres.test.ts
npm run lint
npm run typecheck
npm test
npm run build
git diff --check
git status --short
```

Worker tests and browser E2E are excluded because neither boundary changes.

## Manual validation

When `PLACES_PRODUCTION_DATABASE_URL` is available, run the requested production
command, parse the result again, verify counts/bytes/SHA-256, and confirm Git does
not track the file. If unavailable, stop with the environment-required verdict.

## Evidence ledger

| Evidence | Result |
| --- | --- |
| Focused exporter/contracts | 45 passed, 13 PostgreSQL tests skipped |
| Full unit suite | 361 passed, 130 environment-bound skips |
| Lint, typecheck, build, diff check | PASS |
| Production-target smoke | expected `TARGET_DATABASE_NOT_CONFIGURED` |
| Spec compliance review | no findings |
| Code quality/security review | no findings |

See `evidence/2026-07-28-local-verification.md`.
