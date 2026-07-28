# Places analysis JSON export - Specification

**Mode:** critical
**Status:** approved
**Owner:** repository owner

## Problem

The existing caption exporter emits bounded JSONL and requires manual batch
handling. It cannot produce one validated, complete, target-explicit artifact
that can be sent directly to ChatGPT.

## Outcomes

- `OUT-001`: One command produces one strict, validated JSON document for all
  current eligible posts up to the explicit 10,000-record safety ceiling.
- `OUT-002`: The operation performs PostgreSQL reads and local filesystem writes
  only.
- `OUT-003`: The generated records preserve source text needed for analysis and
  remain compatible with the existing candidate JSONL importer.

## Functional requirements

- `REQ-001`: Reuse `exportCaptionBatch`, `loadAnalysisPostInputs`,
  `computePlacesInputHash`, `canonicalPlacesTheme`, and existing Places
  contracts; do not duplicate eligibility, hashing, or owner-scoped reads.
- `REQ-002`: `--target` accepts only `develop` or `production` and selects only
  its explicit target database variable, with no `DATABASE_URL` fallback.
- `REQ-003`: `--all` includes already analyzed posts, removes the default
  100-record limit, and fails rather than truncating above 10,000 eligible posts.
- `REQ-004`: Support `--owner`, `--post-id`, `--limit`, and `--output`.
- `REQ-005`: Emit schema `places-caption-analysis-input-v2` with strict source,
  summary, candidate-output contract, and exact record fields.
- `REQ-006`: Preserve captions byte-for-byte as JavaScript strings, including
  accents, newlines, punctuation, emojis, and repetitions.
- `REQ-007`: Deterministically extract original-form hashtags and mentions
  without removing them from captions, and preserve internal tags, author, and
  structured Instagram location.
- `REQ-008`: Order records by canonical theme, saved-at descending when present,
  then post id ascending.
- `REQ-009`: Validate schema, counts, unique ids, hash format, non-empty analysis
  versions, eligible themes, and absence of unknown/forbidden fields.
- `REQ-010`: Restrict output to `.tmp`, reject traversal and escaping symlinks,
  validate a temporary file, atomically rename it, and clean temporary files on
  failure.
- `REQ-011`: Always create the single primary file. Above 40 MiB, warn and also
  create autonomous parts under `.tmp/places/analysis-parts/`.
- `REQ-012`: Print only sanitized target data, counts, output path, size, file
  SHA-256, theme counts, and stable error codes; never captions or secrets.
- `REQ-013`: Report actual preflight counts before writing and emit the ready
  marker before the real read-only export.

## Non-functional requirements

- `NFR-001`: The exporter has a hard maximum of 10,000 records in `--all` mode.
- `NFR-002`: A remote target URL must request SSL.
- `NFR-003`: The primary artifact is UTF-8 JSON and `JSON.parse` succeeds.
- `NFR-004`: No new dependency, Prisma migration, browser E2E, worker test, R2
  read, network provider call, or business-data mutation is introduced.

## Invariants and compatibility

- `INV-001`: Only canonically `Voyages` and `Restaurant` records are exported.
- `INV-002`: Collections, folders, tags, and semantic heuristics never grant
  eligibility.
- `INV-003`: The existing candidate JSONL importer and scoring are unchanged.
- `INV-004`: Existing confirmed places and analysis jobs are not changed.
- `INV-005`: `post_id`, `input_hash`, and `analysis_version` remain the identity
  fields echoed by the downstream candidate JSONL.

## Error and edge-case behavior

- `ERR-001`: Missing or invalid target configuration fails with one stable,
  sanitized instruction.
- `ERR-002`: A duplicate post id, invalid record, unsafe output path, or escaping
  symlink fails before final rename.
- `ERR-003`: More than 10,000 eligible records fails without a partial final
  file.
- `ERR-004`: Any write or validation error removes the temporary file.
- `ERR-005`: An unavailable real environment never produces a fabricated file.

## Acceptance criteria

- `AC-001` verifies `REQ-001` through focused source tests and existing
  PostgreSQL Places tests.
- `AC-002` verifies `REQ-002` through table-driven target configuration tests.
- `AC-003` verifies `REQ-003` through forced export and safety-ceiling tests.
- `AC-004` verifies `REQ-005` through strict Zod parse and unknown-field rejection.
- `AC-005` verifies `REQ-006` and `REQ-007` with accents, newlines, emojis,
  hashtags, mentions, location, tags, and author fixtures.
- `AC-006` verifies `REQ-008` with deterministic mixed-theme ordering.
- `AC-007` verifies `REQ-009` with counters, ids, hashes, versions, themes, and
  forbidden-field fixtures.
- `AC-008` verifies `REQ-010` with traversal, protected-directory, symlink,
  atomic rename, and cleanup tests.
- `AC-009` verifies `REQ-011` with a reduced deterministic partition threshold.
- `AC-010` verifies `REQ-012` by capturing logs containing sensitive fixtures.
- `AC-011` verifies `REQ-013` with sanitized preflight output and an actual
  environment run when configuration exists.

## Test seams

| Seam | Behaviors | Existing or new | Evidence method |
| --- | --- | --- | --- |
| `exportCaptionBatch` | eligibility, owner, force, order, no writes | Existing extended | focused Vitest/PostgreSQL |
| analysis JSON service | strict contract, text fidelity, validation, filesystem safety | New | focused Vitest |
| CLI | target selection and sanitized result | New | focused Vitest and real run when configured |
| repository gates | lint, types, full tests, build | Existing | required npm commands |

## Out of scope

- Candidate generation, prompt execution, Geoapify, scoring, import behavior,
  persistence, worker activation, deep media analysis, and API changes.

## Assumptions and risks

- `ASM-001`: Target database URLs are supplied out of band and never committed.
- `RSK-001`: Captions may contain untrusted instructions; the file is data only
  and documentation requires ChatGPT to treat it as untrusted.
- `RSK-002`: A very large file can pressure memory; 10,000 records, a warning,
  and optional autonomous parts bound the operational risk.
