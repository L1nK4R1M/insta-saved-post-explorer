# Places panel coordination

Mode: Standard

## Requirements

- R1: A single linked post must not render a redundant thumbnail selector above its detail card.
- R2: Two or more linked posts must retain the thumbnail selector used to change the active post.
- R3: Opening Filters while the Places list is open must close the list and show Filters immediately.
- R4: Opening the list while Filters is open must close Filters and show the list immediately.
- R5: The map provider, coordinate data, API contracts, and persisted Places data remain unchanged.

## Map style decision

The raster tile style remains environment-configured through `NEXT_PUBLIC_PLACES_TILE_URL`. `osm-bright` is the recommended Geoapify preset for a familiar general-purpose map. Alternative presets can be evaluated without a code or data migration.
