# Extension web sync reconciliation - Release and Operations

Release gate: READY

## Change summary

Insta Saved Sync 4.2.6 makes PostgreSQL the explicit synchronization authority.
Web refresh sends a paired owner-scoped DB snapshot, imports extension-only
posts and aligns the extension index only after success. Extension-first export
continues normally; the next web refresh imports its DB-missing posts and then
converges both sides.

The release also stops two endless-loop modes: a repeated Instagram cursor is
terminal, and repeated identical `running` messages no longer keep the web
spinner alive without actual progress. The exact develop Preview support from
4.2.5 remains, with no Vercel wildcard.

## Prerequisites

- Reviewed 4.2.6 code merged into the target web branch.
- Flat package `C:\tmp\insta-saved-sync-v4.2.6-db-first.zip`, SHA-256
  `E7EF63C70AC5054975A5B07C51BF6388EBC2048797719B6FE93008A237C5A48E`.
- Authenticated application admin and Instagram session for the full smoke.
- Preview and Production `DATABASE_URL` values remain environment-scoped and
  point to their intended Neon branches.
- No migration or secret-value change.

## Migration plan

No Prisma or data migration. The session response adds `knownPosts` while
preserving `knownExternalIds` and `knownPostCodes`. IndexedDB records add
optional `seenPosts` and `progressVersion`; the existing DB version and
`seenPks` compatibility field remain.

The safest upgrade is to replace files in the same unpacked extension directory
and reload it. A completely fresh installation is also supported: the first
successful web sync rebuilds the local canonical index from the DB snapshot and
accepted rows.

## Rollout plan

1. Merge the reviewed correction to `develop` and verify hosted checks plus the
   stable develop Preview deployment.
2. Load/reload the verified 4.2.6 unpacked extension.
3. Authenticate to the exact stable Preview URL, reload the page so the content
   script injects, and confirm extension discovery.
4. Run one controlled Preview refresh. Confirm the spinner reaches success or a
   bounded actionable error, and compare the Preview DB/web count to the
   extension count.
5. Promote the reviewed correction to `main`, verify the Production deployment,
   then reload the Production page and extension.
6. Run one controlled Production refresh. Confirm DB-missing posts import,
   extension and web counts converge, and a second refresh validly reports zero.
7. Stop rollout if known posts re-upload unexpectedly, residual-target failures
   persist after a full export, or progress stalls without the 90-second error.

## Rollback plan

Stop the active task, restore the previous web revision and extension package,
then reload the page and extension. Do not delete already imported posts or
rewrite the extension archive manually. Imported rows use the existing
owner-scoped idempotent path, so a later corrected refresh can replay safely.

## Observability and alerts

| Signal | Expected range | Alert condition | Dashboard or query | Owner |
|---|---|---|---|---|
| Sync job status | `COMPLETED` for a resolved feed | `FAILED`, stale pending/running, or residual targets | Existing sync job/admin state | Owner |
| Extension `progressVersion` | Monotonic while media/pages complete | Unchanged for 90 seconds while non-terminal | Public extension task state | Owner |
| `synced` | DB-missing count, then zero on the second run | Repeated unexpected updates | Extension task and web result | Owner |
| Instagram pauses | Existing bounded retry behavior | Material increase or manual-auth pause | Extension pause reason | Owner |

## Validation after release

Reload extension and page, click **Actualiser les posts**, confirm missing posts
appear, and refresh again to confirm zero new is then valid. Exercise both
orders when practical: local extension export followed by web refresh, and web
refresh from a fresh extension index. Confirm the UI always reaches success,
pause or a bounded actionable error.

Controlled Chromium already proves Production bridge discovery for unpacked
4.2.6. The clean profile redirects Preview to Vercel login, so neither an
authenticated Preview sync nor an authenticated Instagram scan is claimed by
that probe.

## Incident readiness

Use `docs/instagram-extension-sync.md`, the VibeSpec verification report and
this rollback plan. Preserve the existing extension folder before replacement.
Never expose sync tokens, cookies, Vercel credentials or R2 credentials in
incident output.

## Cleanup

No feature flag, schema migration or temporary compatibility route exists. The
external ZIP under `C:\tmp` is an installable artifact, not tracked source.
