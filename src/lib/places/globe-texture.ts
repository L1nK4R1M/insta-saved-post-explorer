// The static Earth texture used by the 3D globe (decision D3).
//
// It is a local asset, not a provider request: no API key, no account and no
// recurring cost. It is generated from the public-domain Natural Earth 1:110m
// country polygons by `scripts/places/generate-earth-texture.mjs`; the source,
// licence and attribution are recorded in `public/places/ATTRIBUTION.md`.
//
// The globe reads it through a single prop, so replacing the file is enough to
// change the look — but only with an asset whose licence is documented first.

export const PLACES_GLOBE_TEXTURE_URL = "/places/earth-dark.png";

export const PLACES_GLOBE_ATTRIBUTION = "Fond de carte : Natural Earth (domaine public)";
