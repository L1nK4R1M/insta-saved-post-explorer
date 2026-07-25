import { describe, expect, it } from "vitest";

import {
  AGGREGATION_MIN_PLACES,
  EARTH_RADIUS_METERS,
  UNKNOWN_GROUP_KEY,
  aggregateByContinent,
  aggregateByCountry,
  angularDistance,
  angularRadiusForMeters,
  buildGlobeScene,
  clampLatitude,
  degreeRadiusForMeters,
  detailLevelForAltitude,
  isRenderableOnGlobe,
  latLonToVec3,
  normalizeLongitude,
  sphericalCentroid,
  toGlobePoints,
} from "@/lib/places/globe-projection";
import type { PlacesMapItem } from "@/server/places/map-view";

function place(overrides: Partial<PlacesMapItem> = {}): PlacesMapItem {
  return {
    id: "p1",
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
    postCount: 3,
    sourceThemes: ["Restaurant"],
    previewThumbnailUrl: null,
    ...overrides,
  };
}

const CLOSE = 1e-9;

describe("longitude normalization", () => {
  it("keeps values already inside the range", () => {
    expect(normalizeLongitude(0)).toBe(0);
    expect(normalizeLongitude(55.1)).toBeCloseTo(55.1, 10);
    expect(normalizeLongitude(-179.9)).toBeCloseTo(-179.9, 10);
  });

  it("wraps the antimeridian to a single representation", () => {
    // 180 and -180 are the same meridian: both must resolve to -180 so two
    // points there never render at opposite sides of the globe.
    expect(normalizeLongitude(180)).toBe(-180);
    expect(normalizeLongitude(-180)).toBe(-180);
    expect(normalizeLongitude(181)).toBeCloseTo(-179, 10);
    expect(normalizeLongitude(-181)).toBeCloseTo(179, 10);
  });

  it("wraps values beyond a full turn", () => {
    expect(normalizeLongitude(370)).toBeCloseTo(10, 10);
    expect(normalizeLongitude(-370)).toBeCloseTo(-10, 10);
    expect(normalizeLongitude(720)).toBe(0);
  });

  it("never returns negative zero or a non-finite value", () => {
    expect(Object.is(normalizeLongitude(-360), -0)).toBe(false);
    expect(normalizeLongitude(Number.NaN)).toBe(0);
    expect(normalizeLongitude(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe("latitude clamping", () => {
  it("clamps rather than wraps, because crossing a pole would flip the longitude", () => {
    expect(clampLatitude(91)).toBe(90);
    expect(clampLatitude(-91)).toBe(-90);
    expect(clampLatitude(45)).toBe(45);
    expect(clampLatitude(Number.NaN)).toBe(0);
  });
});

describe("latLonToVec3", () => {
  it("places the poles on the Y axis", () => {
    const north = latLonToVec3(90, 0);
    expect(north.x).toBeCloseTo(0, 10);
    expect(north.y).toBeCloseTo(1, 10);
    expect(north.z).toBeCloseTo(0, 10);

    const south = latLonToVec3(-90, 0);
    expect(south.y).toBeCloseTo(-1, 10);

    // The longitude is irrelevant at a pole: every meridian meets there.
    for (const lon of [-180, -90, 0, 90, 179.99]) {
      const vec = latLonToVec3(90, lon);
      expect(Math.hypot(vec.x, vec.z)).toBeLessThan(1e-9);
    }
  });

  it("places the origin meridian on +Z", () => {
    const origin = latLonToVec3(0, 0);
    expect(origin.x).toBeCloseTo(0, 10);
    expect(origin.y).toBeCloseTo(0, 10);
    expect(origin.z).toBeCloseTo(1, 10);
  });

  it("puts east on +X and the antimeridian on -Z", () => {
    const east = latLonToVec3(0, 90);
    expect(east.x).toBeCloseTo(1, 10);
    expect(east.z).toBeCloseTo(0, 10);

    const west = latLonToVec3(0, -90);
    expect(west.x).toBeCloseTo(-1, 10);

    const anti = latLonToVec3(0, 180);
    expect(anti.z).toBeCloseTo(-1, 10);
  });

  it("gives 180 and -180 the exact same vector", () => {
    const a = latLonToVec3(12, 180);
    const b = latLonToVec3(12, -180);
    expect(Math.abs(a.x - b.x)).toBeLessThan(CLOSE);
    expect(Math.abs(a.y - b.y)).toBeLessThan(CLOSE);
    expect(Math.abs(a.z - b.z)).toBeLessThan(CLOSE);
  });

  it("scales with the radius and stays on the sphere", () => {
    for (const [lat, lon] of [
      [0, 0],
      [45, 12],
      [-33.9, 151.2],
      [78.2, -15.6],
    ]) {
      const vec = latLonToVec3(lat, lon, 3);
      expect(Math.hypot(vec.x, vec.y, vec.z)).toBeCloseTo(3, 9);
    }
  });

  it("does not mutate or depend on call order", () => {
    const first = latLonToVec3(48.85, 2.35);
    const second = latLonToVec3(48.85, 2.35);
    expect(first).toEqual(second);
  });
});

describe("angularDistance", () => {
  it("is zero for the same point", () => {
    expect(angularDistance(48.85, 2.35, 48.85, 2.35)).toBeCloseTo(0, 12);
  });

  it("is a quarter turn between the equator and a pole", () => {
    expect(angularDistance(0, 0, 90, 0)).toBeCloseTo(Math.PI / 2, 10);
  });

  it("is half a turn between antipodes", () => {
    expect(angularDistance(0, 0, 0, 180)).toBeCloseTo(Math.PI, 9);
    expect(angularDistance(45, 30, -45, -150)).toBeCloseTo(Math.PI, 9);
  });

  it("treats the antimeridian as continuous", () => {
    // Two degrees apart across the date line, not 358.
    const across = angularDistance(0, 179, 0, -179);
    expect(across).toBeCloseTo(angularDistance(0, 1, 0, -1), 12);
  });

  it("is symmetric", () => {
    const ab = angularDistance(35.6, 139.7, -33.8, 151.2);
    const ba = angularDistance(-33.8, 151.2, 35.6, 139.7);
    expect(ab).toBeCloseTo(ba, 12);
  });
});

describe("APPROXIMATE radius conversion", () => {
  it("returns zero for missing, zero or invalid radii", () => {
    expect(angularRadiusForMeters(null)).toBe(0);
    expect(angularRadiusForMeters(undefined)).toBe(0);
    expect(angularRadiusForMeters(0)).toBe(0);
    expect(angularRadiusForMeters(-500)).toBe(0);
    expect(angularRadiusForMeters(Number.NaN)).toBe(0);
  });

  it("converts metres to the matching arc", () => {
    // A quarter of the circumference is a quarter turn of arc.
    const quarter = (Math.PI / 2) * EARTH_RADIUS_METERS;
    expect(angularRadiusForMeters(quarter)).toBeCloseTo(Math.PI / 2, 9);
    expect(degreeRadiusForMeters(quarter)).toBeCloseTo(90, 7);
  });

  it("caps a radius that would wrap around the sphere", () => {
    expect(degreeRadiusForMeters(1e12)).toBeCloseTo(180, 7);
  });

  it("keeps a realistic 5 km zone small but non-zero", () => {
    const degrees = degreeRadiusForMeters(5_000);
    expect(degrees).toBeGreaterThan(0);
    expect(degrees).toBeLessThan(0.1);
  });
});

describe("globe render eligibility", () => {
  it("excludes REJECTED places, exactly like the 2D map", () => {
    expect(isRenderableOnGlobe(place({ reviewStatus: "REJECTED" }))).toBe(false);
    expect(isRenderableOnGlobe(place({ reviewStatus: "UNREVIEWED" }))).toBe(true);
    expect(isRenderableOnGlobe(place({ reviewStatus: "CONFIRMED" }))).toBe(true);
    expect(isRenderableOnGlobe(place({ reviewStatus: "CONFLICT" }))).toBe(true);
  });

  it("excludes coordinates that are not usable", () => {
    expect(isRenderableOnGlobe(place({ latitude: Number.NaN }))).toBe(false);
    expect(isRenderableOnGlobe(place({ longitude: Number.POSITIVE_INFINITY }))).toBe(false);
    expect(isRenderableOnGlobe(place({ latitude: 120 }))).toBe(false);
  });

  it("keeps REJECTED places out of the point list", () => {
    const points = toGlobePoints([place({ id: "ok" }), place({ id: "no", reviewStatus: "REJECTED" })]);
    expect(points.map((point) => point.id)).toEqual(["ok"]);
  });

  it("carries a zone radius only for APPROXIMATE places", () => {
    const points = toGlobePoints([
      place({ id: "exact", precision: "EXACT", approximationRadiusMeters: 5_000 }),
      place({ id: "probable", precision: "PROBABLE", approximationRadiusMeters: 5_000 }),
      place({ id: "zone", precision: "APPROXIMATE", approximationRadiusMeters: 5_000 }),
    ]);
    // A stored radius on an EXACT place must never inflate it into an area.
    expect(points.find((point) => point.id === "exact")?.radiusDegrees).toBe(0);
    expect(points.find((point) => point.id === "probable")?.radiusDegrees).toBe(0);
    expect(points.find((point) => point.id === "zone")?.radiusDegrees).toBeGreaterThan(0);
  });

  it("marks the selected place and normalizes its coordinates", () => {
    const points = toGlobePoints([place({ id: "a", longitude: 200 }), place({ id: "b" })], "a");
    expect(points[0]).toMatchObject({ id: "a", selected: true, lng: -160 });
    expect(points[1].selected).toBe(false);
  });

  it("does not mutate the input", () => {
    const input = [place({ longitude: 200 })];
    const snapshot = structuredClone(input);
    toGlobePoints(input, "p1");
    expect(input).toEqual(snapshot);
  });
});

describe("spherical centroid", () => {
  it("returns the point itself for a single coordinate", () => {
    const centroid = sphericalCentroid([{ lat: 48.85, lng: 2.35 }]);
    expect(centroid.lat).toBeCloseTo(48.85, 9);
    expect(centroid.lng).toBeCloseTo(2.35, 9);
  });

  it("averages across the date line instead of collapsing to Africa", () => {
    // Naive numeric averaging of 179 and -179 gives 0 — the Gulf of Guinea.
    const centroid = sphericalCentroid([
      { lat: 0, lng: 179 },
      { lat: 0, lng: -179 },
    ]);
    expect(Math.abs(centroid.lng)).toBeGreaterThan(179);
    expect(centroid.lat).toBeCloseTo(0, 9);
  });

  it("handles the poles", () => {
    const centroid = sphericalCentroid([
      { lat: 89, lng: 0 },
      { lat: 89, lng: 180 },
    ]);
    expect(centroid.lat).toBeCloseTo(90, 6);
  });

  it("falls back to the first coordinate when the points cancel out", () => {
    const centroid = sphericalCentroid([
      { lat: 0, lng: 0 },
      { lat: 0, lng: 180 },
    ]);
    expect(centroid).toEqual({ lat: 0, lng: 0 });
  });

  it("returns the origin for an empty set", () => {
    expect(sphericalCentroid([])).toEqual({ lat: 0, lng: 0 });
  });
});

describe("aggregation", () => {
  const rome = place({ id: "r1", countryCode: "IT", country: "Italie", latitude: 41.9, longitude: 12.5 });
  const milan = place({ id: "r2", countryCode: "IT", country: "Italie", latitude: 45.5, longitude: 9.2 });
  const paris = place({ id: "f1", countryCode: "FR", country: "France", latitude: 48.9, longitude: 2.35 });
  const tokyo = place({ id: "j1", countryCode: "JP", country: "Japon", latitude: 35.7, longitude: 139.7 });
  const nowhere = place({ id: "x1", countryCode: null, country: null });

  it("groups by country and counts every place", () => {
    const clusters = aggregateByCountry([rome, milan, paris, tokyo]);
    expect(clusters.map((cluster) => [cluster.key, cluster.count])).toEqual([
      ["IT", 2],
      ["FR", 1],
      ["JP", 1],
    ]);
    expect(clusters[0].placeIds).toEqual(["r1", "r2"]);
    expect(clusters[0].label).toBe("Italie");
  });

  it("keeps a country with a single place", () => {
    const clusters = aggregateByCountry([paris]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]).toMatchObject({ key: "FR", count: 1 });
    expect(clusters[0].lat).toBeCloseTo(48.9, 6);
    expect(clusters[0].lng).toBeCloseTo(2.35, 6);
  });

  it("handles a country with many places without losing any", () => {
    const many = Array.from({ length: 200 }, (_, index) =>
      place({ id: `m${index}`, countryCode: "IT", country: "Italie", latitude: 41 + index / 200, longitude: 12 }),
    );
    const clusters = aggregateByCountry(many);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].count).toBe(200);
    expect(clusters[0].placeIds).toHaveLength(200);
  });

  it("groups identical coordinates into one cluster at that exact point", () => {
    const twin = place({ id: "t2", countryCode: "IT", country: "Italie", latitude: 41.9, longitude: 12.5 });
    const clusters = aggregateByCountry([rome, twin]);
    expect(clusters[0].count).toBe(2);
    expect(clusters[0].lat).toBeCloseTo(41.9, 6);
    expect(clusters[0].lng).toBeCloseTo(12.5, 6);
  });

  it("keeps places without a country in an explicit bucket so counts add up", () => {
    const clusters = aggregateByCountry([rome, nowhere]);
    const total = clusters.reduce((sum, cluster) => sum + cluster.count, 0);
    expect(total).toBe(2);
    expect(clusters.some((cluster) => cluster.key === UNKNOWN_GROUP_KEY)).toBe(true);
  });

  it("never aggregates a REJECTED place", () => {
    const clusters = aggregateByCountry([rome, place({ id: "gone", countryCode: "IT", reviewStatus: "REJECTED" })]);
    expect(clusters[0].count).toBe(1);
  });

  it("groups by continent using the existing static table", () => {
    const clusters = aggregateByContinent([rome, milan, paris, tokyo]);
    expect(clusters.map((cluster) => [cluster.key, cluster.count])).toEqual([
      ["EU", 3],
      ["AS", 1],
    ]);
    expect(clusters[0].label).toBe("Europe");
  });

  it("is deterministic for the same input", () => {
    const first = aggregateByCountry([tokyo, paris, rome, milan]);
    const second = aggregateByCountry([tokyo, paris, rome, milan]);
    expect(first).toEqual(second);
  });

  it("does not mutate the input", () => {
    const input = [rome, milan, paris];
    const snapshot = structuredClone(input);
    aggregateByCountry(input);
    aggregateByContinent(input);
    expect(input).toEqual(snapshot);
  });
});

describe("level of detail", () => {
  it("maps the camera altitude to a drill-down level", () => {
    expect(detailLevelForAltitude(2.5)).toBe("continent");
    expect(detailLevelForAltitude(1.6)).toBe("continent");
    expect(detailLevelForAltitude(1.2)).toBe("country");
    expect(detailLevelForAltitude(0.75)).toBe("country");
    expect(detailLevelForAltitude(0.3)).toBe("place");
    expect(detailLevelForAltitude(Number.NaN)).toBe("continent");
  });

  const many = (count: number, countryCode: string) =>
    Array.from({ length: count }, (_, index) =>
      place({ id: `${countryCode}${index}`, countryCode, latitude: index % 60, longitude: index % 170 }),
    );

  it("aggregates by continent at world altitude", () => {
    const scene = buildGlobeScene(many(30, "FR"), { altitude: 2.5 });
    expect(scene.level).toBe("continent");
    expect(scene.points).toHaveLength(0);
    expect(scene.clusters.length).toBeGreaterThan(0);
  });

  it("aggregates by country at mid altitude", () => {
    const scene = buildGlobeScene([...many(20, "FR"), ...many(20, "IT")], { altitude: 1.0 });
    expect(scene.level).toBe("country");
    expect(scene.clusters.map((cluster) => cluster.key).sort()).toEqual(["FR", "IT"]);
  });

  it("shows individual places when the camera is close", () => {
    const scene = buildGlobeScene(many(30, "FR"), { altitude: 0.4 });
    expect(scene.level).toBe("place");
    expect(scene.points).toHaveLength(30);
  });

  it("skips aggregation entirely for a small set", () => {
    const scene = buildGlobeScene(many(AGGREGATION_MIN_PLACES - 1, "FR"), { altitude: 2.5 });
    expect(scene.level).toBe("place");
    expect(scene.points).toHaveLength(AGGREGATION_MIN_PLACES - 1);
  });

  it("always resolves to individual places when one is selected", () => {
    const places = many(40, "FR");
    const scene = buildGlobeScene(places, { altitude: 2.5, selectedId: places[7].id });
    expect(scene.level).toBe("place");
    expect(scene.points.find((point) => point.id === places[7].id)?.selected).toBe(true);
  });

  it("never counts a REJECTED place in any scene", () => {
    const places = [...many(20, "FR"), place({ id: "gone", countryCode: "FR", reviewStatus: "REJECTED" })];
    const aggregated = buildGlobeScene(places, { altitude: 1.0 });
    const detailed = buildGlobeScene(places, { altitude: 0.2 });
    expect(aggregated.clusters.reduce((sum, cluster) => sum + cluster.count, 0)).toBe(20);
    expect(detailed.points).toHaveLength(20);
  });
});
