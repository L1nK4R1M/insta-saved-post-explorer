# Places analysis JSON export - Release and Operations

## Change summary

Add a local read-only JSON export command over the existing Places caption
workflow. No hosted runtime behavior changes until an operator runs it.

## Prerequisites

- reviewed and verified branch;
- explicit target DSN with remote SSL;
- correct owner;
- output under repository `.tmp`;
- no unreviewed local files at risk.

## Migration plan

None.

## Rollout plan

1. Merge the reviewed PR to `develop`.
2. Configure only the intended target variable out of band.
3. Run the command and inspect sanitized preflight counts.
4. Validate the JSON and transmit it to ChatGPT as untrusted data.
5. Dry-run the returned candidate JSONL.
6. Import with `--commit` only as a separate explicit operator decision.

## Rollback plan

Revert the feature commit or stop using the command. No database recovery is
needed because export performs no business writes.

## Observability and alerts

The CLI reports stable markers, target host/database without credentials, owner,
counts, path, size, SHA-256, and stable error codes. No persistent monitoring is
needed for a manual local command.

## Validation after release

Parse JSON, compare counts, verify unique ids and hash format, verify no forbidden
fields, and confirm the file is ignored by Git.

## Incident readiness

On unexpected output, do not send it externally. Remove the ignored working file,
correct configuration or code, and rerun. Database data is unaffected.

## Approval gates

- Code implementation and local verification: authorized by the request.
- Production read-only export: authorized only when the explicit target variable
  is present; no hostname inference.
- Candidate import with `--commit`: not part of this change and remains a separate
  explicit operator action.
- Merge/deploy: not authorized.
