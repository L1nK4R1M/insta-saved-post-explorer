# Places address contract - Follow-up specification compliance review

Date: 28 July 2026
Fixed diff: `e5ba008..codex/places-importer-shutdown`

## Result

No missing, partial, incorrect, or unrequested behavior was found in the
follow-up diff.

- `REQ-005` / `AC-008`: `inner_part` requires the existing textual address,
  matching house number, specific result and contradiction gates plus the
  stricter provider rank threshold 0.95. Rank 0.94 remains non-exact.
- `REQ-010` / `AC-010`: the importer disconnects Prisma in `finally`, avoids
  forced successful exit, and the real Windows dry-run exits 0.
- `REQ-011` / `AC-009`: exact supersession is owner/post scoped, atomic, limited
  to the previous unconfirmed approximate primary, and excludes every place
  retained by the current analysis.
- User-confirmed links, secondary links, canonical places, jobs, and evidence
  remain outside the delete operation.
- No migration, dependency, API, worker, authentication, or Production change
  exists.

Decision: PASS for local implementation compliance; hosted PostgreSQL/CI and
Preview evidence remain release gates.
