# Places mobile usability - Contracts

## API contracts

No versioned API contract changes. `loadPlacePostsAction(placeId)` remains an
internal Server Action returning `ok/posts` or stable `NOT_FOUND` and
`PLACE_POSTS_FAILED` outcomes.

## Data contracts

The action reads at most 24 summaries through `getPlacePosts(placeId,
{ limit: 24 }, getConfiguredOwnerId())`. City-like scoring returns a 10,000
metre radius. The Production correction matches only approximate 25,000 metre
rows and requires exactly 29 updates.

## UI contract

`/places` exposes `Retour aux posts` linking to `/`. At the mobile test viewport,
both view buttons are visible, operable and contained by the segmented control
and Places stage. Selecting a listed place renders at least one linked thumbnail
when the place has associated posts.

## Configuration contract

Owner identity continues to come only from existing server configuration.
Vercel and Neon project/branch configuration is unchanged, and no new runtime
environment variable is introduced.

## Error catalog

`NOT_FOUND` represents a missing or out-of-owner place. `PLACE_POSTS_FAILED`
represents a read failure. A Production data row-count mismatch raises
`PLACES_RADIUS_UPDATE_COUNT_MISMATCH` and rolls back the transaction.
