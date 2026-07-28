# DB-first extension/web synchronization verification report

**Date:** 2026-07-28  
**Revision:** `codex/fix-sync-loop-live` working-tree candidate based on `origin/develop` `28ef4b2`

## Evidence

| Claim | Command or observation | Result | Evidence summary |
|---|---|---|---|
| Duplicate bridge traffic cannot keep a stalled refresh alive | RED/GREEN fake-timer test in `refresh-posts-button.test.tsx` | Pass | Before the fix, identical `running` snapshots kept `0 nouveau` spinning; after the fix, 90 seconds without a changed work checkpoint yields the recovery error |
| PostgreSQL identities remain authoritative and paired | `sync-session.test.ts`, `extension-sync-policy.test.ts` | Pass | The owner-scoped session preserves `externalId`/`postCode` pairing; the extension computes local-only targets without treating archive state as DB ownership |
| A fresh or locally advanced extension converges after successful web sync | Focused four-file Vitest run | Pass | 4 files and 13 tests passed, including empty archive seeding, extension-first reconciliation and legacy-array compatibility |
| MV3 sources are syntactically valid | `node --check` on `background.js`, `sync-policy.js`, `content-bridge.js` | Pass | Exit code 0 |
| Repository quality gates pass | `npm run lint`; `npm run typecheck`; `npm run test`; `npm run build` | Pass | Lint and exact typecheck passed; 329 tests passed and 129 were skipped; the production build generated 32 pages |
| Installable extension identity is coherent | ZIP listing, manifest extraction and SHA-256 | Pass | Flat archive, `manifest.json` at root, version 4.2.6, SHA-256 `E7EF63C70AC5054975A5B07C51BF6388EBC2048797719B6FE93008A237C5A48E` |
| Production page can discover a genuinely loaded 4.2.6 extension | Controlled Chromium CDP probe | Pass | `DISCOVER` returned extension ID `emidbfnoejhhjmbdgonkiddlfgnckgkc`, version `4.2.6` |
| Preview full smoke is currently authenticated | Controlled Chromium Preview navigation | Blocked | The stable Preview redirects the clean browser profile to Vercel login; no authenticated Instagram or Vercel session was copied or bypassed |

## Original scenario

The v4.2.1 historical source was compared with the corrected policy. It seeded
DB identifiers into the local archive and then stopped on that archive, which
could hide missing posts. It also lacked a terminal guard when Instagram
returned `more_available=true` with the same `next_max_id`. The later web
watchdog reset on every identical `running` message, explaining the visible
never-ending spinner even when no work advanced.

The corrected flow starts from the owner-scoped PostgreSQL snapshot. Local
archive entries absent from that snapshot are reconciliation targets, not proof
of ownership. A successful web sync canonicalizes the extension archive from
the DB snapshot, observed identity pairs and rows accepted during the run.

## Traceability status

Verified. FR-001 through FR-013, NFR-001 through NFR-009 and BR-001 through
BR-008 are covered by TASK-001 through TASK-008, AT-001 through AT-011 and
EV-001 through EV-012.

## Unverified areas and limitations

- A full authenticated Preview sync is blocked by the Vercel login in the clean
  controlled browser profile.
- A full authenticated Instagram Production scan requires the owner session and
  is a post-deployment smoke action; only bridge discovery was exercised in the
  isolated browser.

## Residual risks

- The existing session snapshot remains bounded to 10,000 owner posts. The
  observed account is below that capacity, but accounts above it require a
  separately designed pagination contract.
- Existing dependency audit findings remain outside this bounded synchronization
  correction.
