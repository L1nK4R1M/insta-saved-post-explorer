# Places mobile usability - Technical Design

## Design summary

FR-001, FR-002 and NFR-001 use the existing Places header and responsive CSS.
FR-003 and FR-004 keep the established action/service boundary. FR-005 changes
one scoring constant. FR-006 is documentary. FR-007, FR-008, NFR-002 and
NFR-003 are enforced by the release procedure.

## Architecture and dependency flow

The browser renders the existing Next.js Places components. A selected place
invokes the existing thin Server Action, which supplies `getConfiguredOwnerId()`
to the server service and Prisma. Review mutations retain their separate admin
guard. No browser-supplied owner identity is accepted.

## Runtime flows

On mobile, search occupies the first toolbar row and filters plus 2D/3D occupy
the second. The return link targets `/`. Selecting a place loads at most 24 post
summaries. New provider scoring emits 10,000 metres for city-like results.

## Data model and lifecycle

No model changes. The release creates a point-in-time Neon child branch, then a
single guarded transaction changes only `APPROXIMATE` records at 25,000 metres.
Place, link, evidence and job identities remain unchanged.

## Testability

Existing unit seams prove public configured-owner reads, admin mutation guards
and scoring. Playwright proves mobile bounds, navigation and detail loading.
Production health, live Chromium and SQL aggregates provide release evidence.

## Data classification

Place coordinates, post relationships and thumbnails are existing application
data. No secret or credential is added to source. Release evidence records only
aggregate counts, deployment identifiers and non-sensitive branch identifiers.

## Trust boundaries

The public browser may supply only a place identifier. The server selects the
configured owner, and mutation authorization remains server-side. GitHub,
Vercel and Neon operations use their existing scoped control planes.

## Threat model

The main risks are cross-owner disclosure, accidental mutation expansion,
mobile UI regression and an unhealthy deployment. Owner scope, an exact SQL
predicate plus row-count assertion, browser bounds and rollout gates mitigate
those risks.

## Observability

GitHub CI, Vercel deployment state, `/api/health`, `/places`, a real mobile
browser smoke, grouped runtime errors and Neon before/after aggregates provide
independent signals for code, UI and data health.

## Migration and compatibility

There is no schema migration and no public API change. Existing consumers remain
compatible. Persisted 5,000 metre and exact records are untouched, while the 29
legacy city-level records are corrected explicitly.

## Rollout

Merge the reviewed SHA only after CI and Preview pass, wait for Production
READY, verify health, create the Neon backup, execute the guarded transaction,
then repeat route, browser, aggregate and runtime-error checks.

## Rollback

Restore the preceding Vercel deployment for a code regression. For the bounded
data correction, use the backup branch to identify the same 29 place IDs and
restore only those IDs transactionally after reconciling newer writes.
