# Develop Preview origin verification

Date: 2026-07-28
Branch: `codex/allow-develop-preview-sync`
Base: `origin/develop` at `ba56573d66c1bf595a4d8f0551591a5eb423e453`

## Scope and environment evidence

- Neon project `fancy-mud-69762258` has separate `main`
  (`br-super-snow-asyrmnbm`) and `develop`
  (`br-sparkling-glade-as9gow4m`) branches.
- The owner confirmed separate Vercel `DATABASE_URL` values for Preview and
  Production.
- The extension adds only
  `https://insta-saved-post-explorer-git-develop-l1nk4r1ms-projects.vercel.app`
  to manifest host/injection permissions, content-bridge validation and
  background API-origin validation.
- No Prisma schema, migration, API route, dependency, R2 permission or
  authentication change exists in the diff.

## RED/GREEN evidence

- RED: focused policy run had 5 passing tests and one failure because the source
  manifest was still version 4.2.4.
- GREEN: the same suite passed 6/6 after version 4.2.5 and the exact origin were
  added.
- Fixed-diff hardening: the table-driven contract verifies Production,
  localhost and the stable develop Preview at all three boundaries, and rejects
  `*.vercel.app`.

## Fresh verification

- `npm ci`: PASS, 638 packages; existing audit output reports 12 high findings.
- `npm run db:generate`: PASS; Prisma client generated, no migration.
- `node --check` for `background.js`, `content-bridge.js` and `sync-policy.js`:
  PASS.
- Focused policy and refresh-button tests: PASS, 7/7.
- Neighboring six-file sync/import run: PASS, 30/30.
- `npm run lint`: PASS.
- `npm run typecheck`: blocked only by Windows denying
  `tsconfig.tsbuildinfo`; `npx tsc --noEmit --incremental false`: PASS.
- `npm run test`: PASS, 326 passed and 129 PostgreSQL tests skipped by their
  environment gate.
- `npm run build`: PASS, 32 static pages generated.
- Traceability check: PASS, 24 requirements and zero uncovered.
- `vibespec doctor --project`: PASS.

## Package evidence

`C:\tmp\insta-saved-sync-v4.2.5.zip` is flat with `manifest.json` at its root.
The packaged manifest is version 4.2.5 and contains the exact develop Preview
origin. SHA-256:

```text
9F842FD55066B2E88E981A1B545ABAB101E6AE0AE462D92349863FAE7E94479D
```

## Review and rollout boundary

Spec-compliance review found no missing or unrequested functional behavior.
Engineering review found one incomplete test assertion: Production and
localhost preservation were specified but not asserted. The same table-driven
test now covers all three origins and passes.

No live Preview smoke is claimed. The source must first be reviewed, merged and
deployed to the stable develop Preview; extension 4.2.5 must then replace the
existing unpacked extension files and be reloaded.
