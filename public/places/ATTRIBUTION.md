# Earth texture — source, licence and attribution

File: `earth-dark.png` (2048 × 1024, indexed PNG, ~36 KiB)
Used by: the Places 3D globe (`src/features/places/components/places-globe.tsx`)
Added: 25 July 2026, Phase I, decision D3 of `docs/adr/ADR-places-3d-engine.md`

## Source data

**Natural Earth — 1:110m Cultural Vectors, Admin 0 – Countries**
<https://www.naturalearthdata.com/downloads/110m-cultural-vectors/>

## Licence

**Public domain.** Natural Earth states, on its terms-of-use page
<https://www.naturalearthdata.com/about/terms-of-use/>:

> All versions of Natural Earth raster + vector map data found on this website are
> in the public domain. You may use the maps in any manner, including modifying
> the content and design, electronic dissemination, and offset printing. The
> primary authors, Tom Patterson and Nathaniel Vaughn Kelso, and all other
> contributors renounce all financial claim to the maps and invite you to use them
> for personal, educational, and commercial purposes.
>
> No permission is needed to use Natural Earth. Crediting the authors is
> unnecessary.

No paid provider, no API key, no account and no attribution obligation is
involved. Crediting is optional; we credit anyway (see below) because it is good
practice and costs nothing.

## Attribution shown in the application

The globe view displays:

> Fond de carte : Natural Earth (domaine public)

## How the file is produced

The PNG is **not** downloaded. It is generated from the Natural Earth GeoJSON by:

```bash
npm run places:generate-earth-texture
```

`scripts/places/generate-earth-texture.mjs` rasterizes the 177 Admin 0 country
polygons into an equirectangular image — deep navy ocean, slate landmass, lighter
country borders — and encodes it as an indexed PNG with a built-in encoder (no
image-processing dependency).

The GeoJSON input is read from `three-globe/example/country-polygons/` — the
`three-globe` package is MIT-licensed and is already a transitive dependency of
`react-globe.gl`, so the input is pinned by `package-lock.json` and the output is
reproducible.

## Replacing it

The globe reads the texture through a single prop (`textureUrl`). Any other
equirectangular image can replace this file without touching the globe
architecture — but per decision D3, **only** if its licence is clearly compatible
and is documented here first.
