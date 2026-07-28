# Extension web sync reconciliation - Release and Operations

Release gate: READY FOR REVIEW

## Change summary

Insta Saved Sync 4.2.5 reconciles extension-only archive posts into the web
library, preserves the healthy incremental boundary and refuses false success
when archive targets remain unresolved. It also terminates a non-advancing
Instagram final page and recovers a lost terminal extension message from the
durable server job instead of keeping the web refresh spinner active.
It also supports the exact stable develop Preview origin without allowing
arbitrary Vercel deployments.

## Prerequisites

- Owner review and explicit commit/push/deploy authorization.
- Replace files in the same extension installation directory to preserve IDB.
- Authenticated production admin and Instagram session for smoke testing.
- Preview and Production `DATABASE_URL` values must remain environment-scoped
  and point to the Neon `develop` and `main` branches respectively.
- No migration or secret-value change.

## Migration plan

No schema/data migration. MV3 task fields are additive and per-job.

## Rollout plan

1. Review and merge the correction.
2. Deploy web copy only with authorization.
3. Replace extension files with the validated 4.2.5 ZIP and reload the existing
   extension, without installing a second copy.
4. Reload the web page and run one controlled refresh.
5. Compare extension archive count, web library count and sync task status.
   Confirm the spinner transitions to a success check or an actionable error.
   Reload the page once during a completed smoke and confirm the next refresh
   still terminates from the authenticated server-job fallback.
6. Stop if known posts re-upload unexpectedly, rate-limit failures materially
   increase, or residual-target errors persist after a full export.
7. On the stable develop Preview, confirm extension discovery and run one
   controlled refresh. Verify the resulting post count only in the Preview
   database before any Production smoke.

## Rollback plan

Stop the task, restore the previous extension files and revert the correction.
Do not delete already imported posts. Re-run one idempotent refresh after
rollback and inspect the job.

## Observability and alerts

| Signal | Expected range | Alert condition | Dashboard or query | Owner |
|---|---|---|---|---|
| Sync task status | COMPLETED for resolved feed | FAILED/residual after full export | Existing sync job/admin state | Owner |
| `synced` | Missing post count or zero when truly current | Repeated unexpected updates | Extension task state | Owner |
| Instagram pauses | Existing baseline | Material increase | Extension pause reason | Owner |

## Validation after release

Reload extension and page, click refresh, confirm missing posts appear, refresh
again and confirm zero new is then valid. Inspect one media and the sync job. No
production validation is claimed before authorization.
The first 4.2.5 smoke should use the stable develop Preview and confirm that an
unlisted Vercel deployment does not discover the extension.

## Incident readiness

Use `docs/instagram-extension-sync.md` and this rollback plan. Preserve the
existing extension folder and archive. Never expose tokens, cookies or R2
credentials in incident output.

## Cleanup

No feature flag or temporary compatibility path. The external ZIP under
`C:\tmp` is an installable artifact, not a tracked source file.
