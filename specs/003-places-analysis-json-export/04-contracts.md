# Places analysis JSON export - Contracts

> Superseded for future exports by `../005-places-address-contract/`: schema v3
> adds the required nullable candidate `address` field and defaults to
> `places-v2`. This file remains the historical contract verified for feature
> 003.

## Command contract

```text
npm run places:export-analysis-json -- --all --target production \
  --output .tmp/places/places-analysis-input.json
```

Supported flags: `--all`, `--target develop|production`, `--owner <id>`,
`--post-id <id>`, `--limit <n>`, and `--output <path>`.

`--target` is required. `--all` and `--limit` are mutually exclusive. The
default output is `.tmp/places/places-analysis-input.json`.

## Configuration contract

- `PLACES_PRODUCTION_DATABASE_URL`: exclusive production target DSN.
- `PLACES_DEVELOP_DATABASE_URL`: exclusive develop target DSN.
- `APP_OWNER_ID`: default owner; `--owner` overrides it.
- `PLACES_ANALYSIS_VERSION`: existing optional analysis-version override.

There is no fallback from these target variables to `DATABASE_URL`.

## Data contract

The producer is the repository CLI. The consumer is manual ChatGPT analysis.
The source of truth remains PostgreSQL through `src/server`.

The root is strict and contains:

- `schema_version = "places-caption-analysis-input-v2"`
- `generated_at` ISO-8601
- strict `source`
- exact `summary`
- strict `candidate_output_contract`
- strict `records`

Each record contains exactly `post_id`, `main_theme`, `caption`, `hashtags`,
`mentions`, `internal_tags`, `author_username`, `instagram_location`,
`input_hash`, and `analysis_version`.

## Candidate-output contract

The document declares JSONL, at most five candidates per post, forbidden
coordinates/provider/precision fields, and required identity fields
`post_id`, `input_hash`, and `analysis_version`. The existing
`placeCandidateRecordSchema` remains authoritative at import.

## Error catalog

| Code | Meaning |
| --- | --- |
| `TARGET_REQUIRED` | `--target` missing |
| `TARGET_INVALID` | target is not develop or production |
| `TARGET_DATABASE_NOT_CONFIGURED` | explicit target DSN absent |
| `TARGET_SSL_REQUIRED` | remote DSN does not require SSL |
| `ARGUMENT_INVALID` | invalid or conflicting flag |
| `EXPORT_LIMIT_EXCEEDED` | more than 10,000 eligible records |
| `OUTPUT_PATH_UNSAFE` | path is outside `.tmp` or reaches a protected/symlink target |
| `EXPORT_VALIDATION_FAILED` | strict document or written-file validation failed |
| `EXPORT_WRITE_FAILED` | atomic filesystem operation failed |

## Compatibility guarantees

No existing API, Prisma schema, JSONL candidate schema, importer, Geoapify
resolver, scoring rule, place persistence, or worker behavior changes.
