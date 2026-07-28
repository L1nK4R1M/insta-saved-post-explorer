# Extension/web sync reconciliation verification

Date: 2026-07-28
Branch: `codex/fix-extension-sync-refresh`
Base: `origin/develop` at `c4e37f6`

## Demonstrated cause

The former web-sync stop set combined `ArchiveStore.seenPks` with website-known
post codes. A post exported locally but absent from PostgreSQL was therefore
classified as already synchronized and could terminate the scan with zero new
posts.

## RED/GREEN evidence

1. The first focused run failed because the separated reconciliation policy did
   not exist.
2. The residual-target test failed before incomplete completion was rejected.
3. The injected later-upload failure failed before page-level target commit was
   introduced.
4. The production final-page regression failed with `isFeedPageTerminal is not
   a function` before a repeated-cursor terminal policy existed.
5. Direct Chrome state showed the loaded 4.2.4 worker and a durable extension
   task in `completed` while the web button remained running.
6. The refresh-button regression failed before the web UI polled its
   owner-scoped server job as a terminal fallback.
7. Final focused policy and UI suite: 7/7 passed.

## Final commands

- `npm ci`: PASS, 638 packages; existing audit output reports 12 high findings.
- `npm run db:generate`: PASS; generated client only, no migration.
- MV3 `node --check` for `background.js` and `sync-policy.js`: PASS.
- Neighboring five-file run: PASS, 29/29.
- `npm run lint`: PASS.
- `npx tsc --noEmit --incremental false`: PASS; the standard cache file was
  locked by another Windows process.
- `npm run test`: PASS, 326 passed and 129 DB tests skipped.
- `npm run build`: PASS, 32 static pages generated.
- VibeSpec traceability: PASS, zero uncovered requirements.
- VibeSpec validation: PASS, zero errors and zero warnings.
- `git diff --check` and added-file whitespace scan: PASS.

## Package evidence

`C:\tmp\insta-saved-sync-v4.2.4.zip` has `manifest.json` at its root and includes
`sync-policy.js`. SHA-256:

```text
F3C1A317D65EDC8D5DF2662954E3412A2941B82CD81524FD5E30831B0F30D2BC
```

## Review boundaries

No schema, migration, new API route, authentication, R2 permission, host
permission, dependency, production deployment or store publication is included.
Production smoke of the merged web fallback remains pending explicit rollout
authorization.
