# Places address contract - Follow-up engineering and safety review

Date: 28 July 2026
Fixed diff: `e5ba008..codex/places-importer-shutdown`

## Findings

No blocker, high, medium, or low finding remains in the reviewed diff.

## Review notes

- The scoring relaxation does not accept street, postcode, city, missing, or
  weak-rank matches. House-number and location contradictions still fail closed.
- Link supersession executes inside the existing per-post Prisma transaction
  before primary assignment. The predicate includes owner, post, primary,
  unconfirmed, approximate, and current-result exclusion constraints.
- No canonical row or evidence is deleted, so rollback and audit history remain
  available.
- The successful CLI path closes Prisma and exits naturally; the failure path
  preserves a non-zero exit via `process.exitCode` without racing active libuv
  handles.
- The new PostgreSQL regression combines automatic and confirmed scenarios in
  one file because both protect the same destructive-boundary invariant.
- The real dry-run emitted counts and bounded provider/scoring metadata only;
  no secret, raw response, coordinate, request URL, or address was recorded.

Decision: PASS for CI submission. Production and committed data operations
remain blocked.
