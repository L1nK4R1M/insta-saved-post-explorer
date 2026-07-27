# PR #39 production R2 AbortSignal correction

**Date:** 2026-07-27
**Reviewed head:** `f445da6c4dd4868341d2c4b96cf0e8b16ef8a483`

## Demonstrated cause

`downloadToWorkdir` called the internal sender with
`{ abortSignal: signal }`, but the production wrapper accepted only `command`
and called `ownedClient.send(command)`. The AWS SDK therefore never received the
deadline cancellation signal.

## TDD evidence

- RED: the consolidated production-seam test completed cancellation and cleanup
  but observed `undefined` instead of the execution `AbortSignal`.
- GREEN: after forwarding `sendOptions`, the focused file passes 10/10 tests.
- The regression proves strict signal identity, the sender observing abort, the
  retryable `WORKER_R2_UNAVAILABLE` classification and zero partial files.

## Final verification

- `npm ci`: PASS (638 packages installed; existing audit reports 12 high
  vulnerabilities and was not mutated with `audit fix`).
- `npm run db:generate`: PASS. This restored the generated Prisma client removed
  by the clean install; no schema or migration changed.
- `npm run lint`: PASS.
- `npm run typecheck`: PASS.
- `npm run worker:typecheck`: PASS.
- `npm run worker:test -- io-security.test.ts`: PASS, 10/10.
- `npm run worker:test`: PASS, 53 passed and 7 database tests skipped.
- `npm run test`: PASS, 319 passed and 129 database tests skipped.
- `npm run worker:build`: PASS.
- `npm run build`: PASS, production compilation and 32 static pages generated.

The first root typecheck, root test and application build attempted immediately
after `npm ci` failed only because the clean install had removed the generated
Prisma client. Running the repository's `db:generate` command restored that
expected generated dependency; all three commands then passed without any
source, schema or migration correction.

## Independent review passes

- Specification compliance: PASS. FR-008, FR-010, NFR-003 and NFR-006 map to
  TASK-013, AT-021 and EV-013; the implementation uses the existing production
  adapter and keeps GetObject-only capability.
- Engineering quality and security: PASS. The fix is the minimal second-argument
  forwarding change; the consolidated production-seam regression covers signal
  identity, active abort, error classification, cleanup and client destruction.
  No open HIGH or BLOCKER finding remains.

## Boundaries

No Prisma schema, migration, queue, grant, heartbeat, shutdown architecture,
R2 write capability, hosted database, VPS or merge operation is included.
