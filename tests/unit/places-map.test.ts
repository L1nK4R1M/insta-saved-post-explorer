// Required to protect the MapLibre style/GeoJSON contracts and REQ-001 points-only regression.
import { describe, expect, it } from "vitest";

import type { PlacesMapItem } from "@/server/places/map-view";
import { buildMapStyle, buildPlacesGeoJson } from "@/features/places/components/places-map";

function place(overrides: Partial<PlacesMapItem> = {}): PlacesMapItem {
  return {
    id: "place-1",
    displayName: "Nobu Dubai",
    category: "catering.restaurant",
    categoryGroup: "restaurant",
    city: "Dubai",
    region: null,
    country: "Émirats arabes unis",
    countryCode: "AE",
    latitude: 25.1,
    longitude: 55.1,
    precision: "EXACT",
    confidence: 0.9,
    approximationRadiusMeters: null,
    reviewStatus: "UNREVIEWED",
    isUserConfirmed: false,
    postCount: 2,
    sourceThemes: ["Restaurant"],
    previewThumbnailUrl: null,
    ...overrides,
  };
}

describe("MapLibre Places data", () => {
  it("builds a raster style with the configured attribution", () => {
    const style = buildMapStyle("https://tiles.example/{z}/{x}/{y}.png", "© tiles");

    expect(style.sources.placesRaster).toEqual({
      type: "raster",
      tiles: ["https://tiles.example/{z}/{x}/{y}.png"],
      tileSize: 256,
      maxzoom: 19,
      attribution: "© tiles",
    });
    expect(style.layers.map((layer) => layer.id)).toContain("places-raster");
    expect(style.projection).toEqual({ type: "mercator" });
  });

  it("adds the local Earth image as the globe projection base layer", () => {
    const style = buildMapStyle("", "", {
      projection: "globe",
      textureUrl: "/places/earth-dark.png",
    });

    expect(style.sources.placesEarth).toMatchObject({
      type: "image",
      url: "/places/earth-dark.png",
      coordinates: [
        [-180, 85.051129],
        [180, 85.051129],
        [180, -85.051129],
        [-180, -85.051129],
      ],
    });
    expect(style.layers).toContainEqual(
      expect.objectContaining({
        id: "places-earth",
        type: "raster",
        source: "placesEarth",
        layout: { visibility: "visible" },
      }),
    );
    expect(style.projection).toEqual({ type: "globe" });
  });

  it("keeps the local Earth base and hides provider tiles on the globe", () => {
    const style = buildMapStyle("https://tiles.example/{z}/{x}/{y}.png", "© tiles", {
      projection: "globe",
      textureUrl: "/places/earth-dark.png",
    });

    expect(style.sources.placesEarth).toMatchObject({ type: "image", url: "/places/earth-dark.png" });
    expect(style.layers).toContainEqual(
      expect.objectContaining({ id: "places-raster", layout: { visibility: "none" } }),
    );
    expect(style.layers).toContainEqual(
      expect.objectContaining({ id: "places-earth", layout: { visibility: "visible" } }),
    );
  });

  it("serializes pins with stable ids, icons, precision colors and selection", () => {
    const data = buildPlacesGeoJson([place(), place({ id: "place-2", precision: "APPROXIMATE", categoryGroup: null })], "place-2");

    expect(data.features).toHaveLength(1);
    expect(data.features[0]).toMatchObject({
      geometry: { type: "Point", coordinates: [55.1, 25.1] },
      properties: { id: "place-1", iconImage: "places-icon-restaurant", color: "#16794b", selected: false },
    });
    expect(data.features.find((feature) => feature.properties.id === "place-2")).toBeUndefined();
  });

});
