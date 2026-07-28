# Places analysis JSON export - Code quality and security review

Date: 2026-07-28
Fixed diff point: post-implementation working tree before commit

## Findings

No blocker, high, medium, or low engineering finding remains.

## Correctness

- Cursor pagination is by unique post id and scans until exhaustion.
- Complete mode implicitly forces inclusion and fails on record 10,001.
- Final order is canonical theme, saved date descending/null-last, then
  code-point post id.
- Strict validation runs before and after temporary-file serialization.

## Security and privacy

- Target selection has no ambient `DATABASE_URL` fallback.
- Remote targets require SSL and logs omit userinfo, password, query parameters,
  captions, and secrets.
- Static database imports occur after explicit target selection.
- Output is lexically and physically confined to `.tmp`; existing escaping
  symlinks/junctions are rejected and parents are rechecked after creation.
- Source audit finds no create/update/delete/upsert/raw-write/provider/R2/media
  call in the export path.

## Reliability and recovery

- The primary file uses a unique sibling temporary file and atomic rename.
- Temporary files are removed in `finally`.
- Large-file parts are complete strict documents and never split a caption.
- Stable codes make failures rerunnable without exposing raw exception messages.

## Maintainability

- New behavior is isolated behind one server module and one thin script.
- The existing candidate maximum is exported and reused rather than duplicated.
- One compact new test file table-drives forbidden fields and CLI/path variants.

## Residual risks

The two environment limitations recorded in local verification remain: no live
PostgreSQL test URL and no explicit production export URL.
