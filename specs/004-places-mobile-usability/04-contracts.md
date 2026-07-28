# Places mobile usability - Contracts

## Navigation contract

`/places` displays a labelled link to `/`. Browser back/forward for 2D/3D state
continues to work independently.

## Mobile layout contract

At the configured mobile Playwright viewport, the 2D and 3D buttons are visible,
operable, and fully contained by both `.places-segmented` and `.places-stage`.

## Linked-post read contract

`loadPlacePostsAction(placeId)` reads at most 24 summaries using:

```text
getPlacePosts(placeId, { limit: 24 }, getConfiguredOwnerId())
```

It returns only `ok/posts` or stable `NOT_FOUND`/`PLACE_POSTS_FAILED` codes. It
does not accept an owner from the client. Confirm/reject keep the admin contract.

## Radius contract

City-like approximate provider types produce `approximationRadiusMeters =
10_000` for newly scored results. Persisted values remain unchanged until a
separate authorized correction.
