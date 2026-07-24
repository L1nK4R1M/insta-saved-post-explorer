# Places read API and review services (Phase F3)

Phase F3 completes the metadata-first Places backend: a read-only external API,
distinct statistics, and internal review/merge services. No UI, map, worker,
video/OCR/transcription, MCP, or Hermes integration is part of F3.

## 1. Authentication and security

All `/api/v1/places*` routes reuse the Phase D external Bearer key
(`Authorization: Bearer ipe_<secret>`, `requireExternalApiKey`). The key is
**read-only**: no route mutates data, and every route exposes only `GET`.
Responses carry the V1 security headers (`Cache-Control: private, no-store`,
`Vary: Authorization`). Missing/invalid key → `401`; unconfigured API → `503`.
Every query is owner-scoped; a resource owned by someone else behaves as absent
(`404`), never confirming its existence.

Errors use the stable V1 contract `{ "error": { "code", "message" } }`:

| Situation | HTTP | code |
| --- | --- | --- |
| Missing/invalid key | 401 | UNAUTHORIZED |
| API not configured | 503 | SERVICE_UNAVAILABLE |
| Invalid params / invalid cursor | 400 | BAD_REQUEST |
| Resource absent for owner | 404 | NOT_FOUND |
| Unexpected | 500 | INTERNAL_ERROR |

## 2. Endpoints

```text
GET /api/v1/places
GET /api/v1/places/{id}
GET /api/v1/places/{id}/posts
GET /api/v1/places/stats
GET /api/v1/places/eligible-posts
GET /api/v1/places/unresolved
GET /api/v1/places/analysis-jobs/{id}
```

### GET /api/v1/places

Owner-scoped, cursor-paginated list ordered `updatedAt DESC, id DESC`.

Query parameters:

| Param | Meaning |
| --- | --- |
| `cursor` | Opaque F1 cursor from a previous `nextCursor`. |
| `limit` | 1–100, default 50. |
| `country_code` | ISO-2 country filter. |
| `continent_code` | Continent filter (AF/AN/AS/EU/NA/OC/SA). |
| `review_status` | UNREVIEWED / CONFIRMED / REJECTED / CONFLICT. |
| `precision` | EXACT / PROBABLE / APPROXIMATE. |
| `city`, `category` | Case-insensitive equality. |
| `min_confidence` | 0–1 lower bound. |
| `q` | Text search on display name, normalized name, and city. |

Response:

```json
{ "items": [ { "id": "...", "displayName": "...", "postCount": 3, "precision": "EXACT", "reviewStatus": "UNREVIEWED", "updatedAt": "2026-07-24T00:00:00.000Z" } ], "nextCursor": null }
```

`bbox`/`nearby` and a `source_theme` list filter are intentionally deferred to a
later phase (they need a defined UX contract); F3 does not improvise them.

### GET /api/v1/places/{id}

Full detail for one place: canonical identity, coordinates, precision,
confidence, city/region/country/continent, review status, `postCount`,
non-sensitive provider metadata (`provider`, `providerResultType`,
`attribution`), and a bounded list (≤20) of recent evidence. Never returns the
Geoapify key, OAuth data, or raw provider payloads. `404` when absent.

### GET /api/v1/places/{id}/posts

Cursor-paginated posts linked to a place (`postId`, `postUrl`, `thumbnailUrl`,
`authorUsername`, `mainTheme`, `isPrimary`, `precision`, `confidence`,
`linkedAt`). `404` when the place is absent for the owner.

### GET /api/v1/places/stats

Distinct statistics (see §3). Accepts `country_code`, `continent_code`,
`precision` filters on the place-scoped aggregations.

### GET /api/v1/places/eligible-posts

Cursor-paginated eligible posts (theme `Voyages`/`Restaurant`) with **no** place
link yet — the unanalyzed backlog. No collection is consulted.

### GET /api/v1/places/unresolved

Cursor-paginated analysis jobs in `NEEDS_REVIEW` (the UNKNOWN outcomes).

### GET /api/v1/places/analysis-jobs/{id}

One job's safe fields (status, stage, depth, source theme, analysis version,
attempt count, bounded `errorCode`, structured `result`, timestamps). The raw
`errorMessage` is never exposed.

## 3. Statistics semantics

```json
{
  "totals": { "eligiblePosts": 0, "identifiedPlaces": 0, "countries": 0, "continents": 0, "postsWithPlaces": 0, "needsReview": 0 },
  "byTheme": [], "byCountry": [], "byContinent": [], "byPrecision": [], "byReviewStatus": []
}
```

- `identifiedPlaces`: distinct canonical places excluding `REJECTED`.
- `countries` / `continents`: distinct codes among identified places.
- `postsWithPlaces`: distinct posts linked to an identified place (a post linked
  to several places counts once).
- `needsReview`: `NEEDS_REVIEW` jobs (UNKNOWN outcomes) plus `CONFLICT` places.
- `eligiblePosts`: eligible posts under the shared theme predicate.
- Breakdowns use distinct place and distinct post counts; multiple evidence rows
  never inflate a count, and `CollectionPost` is never joined.

## 4. Internal review and merge services

`src/server/places/review.ts` exposes service-only mutations — **never** wired to
the read-only external API and reserved for a future authenticated admin UI or
scoped MCP command:

- `confirmPlace(ownerId, placeId)` — mark CONFIRMED and user-confirmed.
- `rejectPlaceResult(ownerId, placeId)` — mark REJECTED without deleting links or evidence.
- `correctPostPlace(ownerId, { postId, placeId, isPrimary?, reason? })` — mark a
  link user-confirmed, optionally set the single primary, and record a bounded
  `USER_CORRECTION` evidence row.
- `mergePlaces(ownerId, { sourcePlaceId, targetPlaceId })` — transactional merge:
  move/dedup links, re-point evidence, preserve user corrections, keep one
  primary per post, delete the source, roll back on failure.

A user correction dominates automatic re-analysis (enforced by the F2 analysis
service, which never overwrites user-confirmed places or links). Every method is
owner-scoped; a cross-owner resource behaves as `PLACE_NOT_FOUND`.
