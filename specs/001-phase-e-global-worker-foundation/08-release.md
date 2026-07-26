# Phase E Global Worker Foundation - Release

## Change summary

Implemented additive worker package, PostgreSQL queue migration/grants, runtime,
read-only R2 adapter, temporary-workdir lifecycle, internal health, hardened
container, tests and operations documentation, verified locally before final
repository gates. No release or deployment is authorized by the implementation request.

## Prerequisites

- Pull request CI and independent reviews pass.
- Phase E migration is reviewed as additive.
- Preview uses an isolated PostgreSQL branch and non-production R2 fixture.
- Dedicated worker login and read-only R2 credentials are provisioned out of band.
- Coolify service has no public route or host port.

## Migration plan

Apply the committed migration through the protected `Database release` workflow
to Preview first. Verify `claimed_at`, `next_attempt_at`, the claim index and
exact grants through catalog queries. Do not use `prisma migrate dev`, `db push`
or production credentials. Production migration requires separate operator
approval after Preview evidence.

## Rollout plan

1. Build the immutable worker image.
2. Start one instance with a required owner and no unsupported handler.
3. Verify internal liveness/readiness and structured startup logs.
4. Run foundation smoke only on an isolated database.
5. Keep the production worker stopped until the real future handler is reviewed.
6. Enable one owner/one instance first; scale only after queue observations.

This pull request stops before these operator actions.

## Rollback plan

Stop the worker/container. Revoke the login role membership and R2 credential if
security is involved. Roll back application/container revision while leaving
the additive columns in place. Correct schema or grants with a new fix-forward
migration. Use Neon PITR only for demonstrated data corruption and only through
the existing protected operational procedure.

## Observability and alerts

Before any real handler starts, route structured logs and alerts for readiness
failure, repeated DB errors, lease loss, retries exhausted, cleanup failure,
stale workdirs, shutdown timeout and container restart loops. Alert thresholds
and recipients require the VPS operator decision; no SaaS integration is added
in Phase E.

## Incident readiness

The runbook must cover: stop claims, inspect safe queue columns, revoke worker
credentials, restart after DB/R2 recovery, reclaim expired leases, clean stale
workdirs without leaving the root, and preserve evidence without logging payload
or secrets. Incident ownership remains the repository owner until delegated.

## Validation after release

On Preview/internal network only: check liveness/readiness, database grants,
read-only R2 access, non-root UID, zero published ports, one isolated smoke job,
concurrent claim, expired lease recovery, SIGTERM cleanup and absence of secret
values in logs. Hosted/VPS proof must be reported separately from local proof.

## Approval gates

| Gate | Required evidence | Approver | Status |
|---|---|---|---|
| Pull request ready | CI, full tests, Docker smoke, reviews, convergence PASS | Repository owner | Ready for owner review (PR #39) |
| Preview migration | Reviewed migration and isolated DB target | Environment approver | Pending |
| VPS deployment | Credentials, firewall, backup, alerts and rollback rehearsal | Repository owner/operator | Not authorized |
| Phase H handler | Separate approved specification and PR | Repository owner | Out of scope |

Release gate: READY

`READY` means the open, unmerged PR package is ready for owner review. Preview
migration, hosted credentials and VPS deployment remain separate pending or
unauthorized gates and were not performed.
