# Places analysis JSON export - Technical Design

## Context and constraints

The design extends the existing local Phase F caption workflow. It must reuse the
current domain seams, never mutate PostgreSQL, and never select production from
an ambiguous generic database URL.

## Options considered

| Option | Strengths | Costs and risks | Decision |
| --- | --- | --- | --- |
| New independent query/export stack | Easy CLI-specific shaping | Duplicates eligibility, owner scope, and hash | Rejected |
| Add JSON formatting to the existing JSONL script | Few files | Couples legacy behavior and weakens test seams | Rejected |
| New strict JSON service over enhanced `exportCaptionBatch` | Reuses source of truth and isolates filesystem safety | One new server module | Selected |

## Selected design

### Modules and ownership

| Module | Responsibility | Public interface | Dependencies |
| --- | --- | --- | --- |
| `caption-batch.ts` | Complete owner-scoped source records and deterministic order | `exportCaptionBatch`, preflight counts | Prisma, repository, eligibility, hash |
| `analysis-json-export.ts` | Strict schema, enrichment, validation, safe atomic files and partitioning | build/write/validate functions | Zod, Node filesystem/crypto |
| CLI script | Args, explicit target selection, Git source metadata, sanitized logs | npm command | two server services |

### Data and control flow

1. Parse and validate flags.
2. Select exactly one explicit target URL and validate SSL.
3. Set the Prisma runtime URL before dynamically importing database services.
4. Count owner-scoped posts/themes using canonical eligibility.
5. Print sanitized preflight and ready markers.
6. Call `exportCaptionBatch` with force enabled.
7. Enrich with deterministic hashtag/mention arrays and strict metadata.
8. Validate, write a sibling temporary file, parse and validate it again, hash
   it, then rename to the final `.tmp` path.
9. If over 40 MiB, additionally write autonomous parts atomically.

### Failure and recovery

All failures use stable sanitized codes. A temporary file is removed in `finally`.
No final file is created after validation failure. Recovery is rerunning the same
read-only command after correcting configuration or source data.

### Security or safety

- Captions are sensitive untrusted data and never appear in logs or exceptions.
- Strict schemas reject all unknown root/record fields.
- Output is lexically and physically confined to the repository `.tmp` tree.
- Existing symlink ancestors are resolved before directory creation and again
  before writing.
- Remote targets require SSL.
- Static database imports occur only after explicit target selection.

### Compatibility and rollout

The existing JSONL command and candidate importer remain available. Rollout is
local command availability, then a real explicit-target export. No deployment,
migration, feature flag, or API version change is involved.

### Observability

Stable markers, sanitized target, owner, total/eligible/exported counts, output
path, byte size, and SHA-256 provide operator evidence. Captions and DSNs are
never logged.

### Rollback

Revert the feature commit or remove the npm command and new module/script/docs.
There is no database rollback because the feature performs no business writes.
Generated `.tmp` artifacts are ignored working data and may be removed by the
operator.
