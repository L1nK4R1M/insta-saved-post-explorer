# Production hotfix verification

Date: 2026-07-28
Branch: `codex/prod-sync-db-first`
Production base: `origin/main` at `55320ffb6199eaf34155c10cd38c24fb46edd0b0`
Source corrections: develop squashes `2b877ba043a004b925acdfae3f3decd7fbc89a44`
and `f74302b3bba6bf9bd29ab66d6ef8fbc32d5479b3`

## Scope decision

Promoting `develop` directly would include unrelated Places and worker phases.
The hotfix therefore ports only the exact-origin compatibility and DB-first
extension/web synchronization corrections to `main`.

No migration, dependency, new API route, R2 permission, authentication change
or worker deployment is included. One exact reviewed Preview origin is added;
no wildcard is accepted. The existing session response additively returns
paired `knownPosts` while preserving its two legacy arrays.

## Fresh local gates on the production base

- `npm ci`: PASS; 572 packages installed. Existing audit output reports 12 high
  findings; no breaking audit fix was applied.
- `npm run db:generate`: PASS; client generation only, no migration.
- focused policy, media, UI and session tests: PASS, 13/13.
- `npm run lint`: PASS.
- `npm run typecheck`: PASS exactly; sandbox cache writing required the same
  command outside the restricted file-write layer.
- `npm run test`: PASS, 152 passed and 22 skipped.
- `npm run build`: PASS, 27 pages generated.
- VibeSpec validation: PASS, 0 errors and 0 warnings.
- flat extension 4.2.6 package: PASS, SHA-256
  `E7EF63C70AC5054975A5B07C51BF6388EBC2048797719B6FE93008A237C5A48E`.
- `git diff --check`: PASS.

## Rollout and rollback

Rollout is a PR from this hotfix branch to `main`, followed by Vercel Production
status verification and read-only smoke checks. Rollback is a revert of the
hotfix merge; do not delete synchronized posts or replace the extension archive.

Hosted checks, the final Production deployment identifier and runtime smoke are
recorded after the PR is pushed and merged.
