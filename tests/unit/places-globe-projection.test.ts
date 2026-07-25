import { describe, expect, it } from "vitest";

import {
  AGGREGATION_MIN_PLACES,
  EARTH_RADIUS_METERS,
  UNKNOWN_GROUP_KEY,
  aggregateByContinent,
  aggregateByCountry,
  angularDistance,
  buildGlobeScene,
  degreeRadiusForMeters,
  detailLevelForAltitude,
  geodesicCircleRing,
  latLonToVec3,
  normalizeLongitude,
  sphericalCentroid,
  toDegrees,
  toGlobePoints,
  toGlobeZones,
} from "@/lib/places/globe-projection";
import type { PlacesMapItem } from "@/server/places/map-view";

// Risk-based coverage for the pure 3D view model. The cases kept here are the
// ones that would silently produce a wrong globe: the sphere conventions, the
// antimeridian and the poles, the honest-precision rules, and the aggregation
// that could place a cluster on the wrong continent. Numeric variants are
// parameterized rather than repeated as separate cases.

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

describe("coordinate normalization", () => {
  // 180 and -180 are the same meridian: two representations would render two
  // points on opposite sides of the globe.
  it("wraps longitude into a single representation and survives bad input", () => {
    const cases: [number, number][] = [
      [0, 0], [55.1, 55.1], [180, -180], [-180, -180], [181, -179],
      [370, 10], [-370, -10], [720, 0], [Number.NaN, 0], [Number.POSITIVE_INFINITY, 0],
    ];
    for (const [input, expected] of cases) {
      expect(normalizeLongitude(input), `longitude ${input}`).toBeCloseTo(expected, 9);
    }
    expect(Object.is(normalizeLongitude(-360), -0)).toBe(false);
  });
});

describe("sphere projection", () => {
  // Fixing the conventions once: +Y through the north pole, +Z through (0, 0),
  // +X east. Everything the globe draws depends on these holding.
  it("honours the sphere conventions, the poles and the antimeridian", () => {
    const cases: [string, number, number, { x: number; y: number; z: number }][] = [
      ["north pole", 90, 0, { x: 0, y: 1, z: 0 }],
      ["south pole", -90, 0, { x: 0, y: -1, z: 0 }],
      ["origin meridian", 0, 0, { x: 0, y: 0, z: 1 }],
      ["east", 0, 90, { x: 1, y: 0, z: 0 }],
      ["west", 0, -90, { x: -1, y: 0, z: 0 }],
      ["antimeridian", 0, 180, { x: 0, y: 0, z: -1 }],
    ];
    for (const [label, lat, lon, expected] of cases) {
      const vec = latLonToVec3(lat, lon);
      expect(vec.x, label).toBeCloseTo(expected.x, 9);
      expect(vec.y, label).toBeCloseTo(expected.y, 9);
      expect(vec.z, label).toBeCloseTo(expected.z, 9);
    }

    for (const lon of [-180, -90, 0, 90, 179.99]) {
      expect(Math.hypot(latLonToVec3(90, lon).x, latLonToVec3(90, lon).z)).toBeLessThan(1e-9);
    }
    for (const [lat, lon] of [[45, 12], [-33.9, 151.2], [78.2, -15.6]]) {
      expect(Math.hypot(...Object.values(latLonToVec3(lat, lon, 3)))).toBeCloseTo(3, 9);
    }
    // Latitude is clamped, not wrapped: crossing a pole would flip the longitude.
    expect(latLonToVec3(91, 0).y).toBeCloseTo(1, 9);
    expect(latLonToVec3(12, 180)).toEqual(latLonToVec3(12, -180));
  });
});

describe("angular distance", () => {
  it("measures great-circle distance, including across the date line", () => {
    const cases: [string, number, number, number, number, number][] = [
      ["same point", 48.85, 2.35, 48.85, 2.35, 0],
      ["equator to pole", 0, 0, 90, 0, 90],
      ["antipodes", 0, 0, 0, 180, 180],
      ["antipodes off-axis", 45, 30, -45, -150, 180],
      // Two degrees apart across the date line, not 358.
      ["across the antimeridian", 0, 179, 0, -179, 2],
    ];
    for (const [label, aLat, aLon, bLat, bLon, expected] of cases) {
      expect(toDegrees(angularDistance(aLat, aLon, bLat, bLon)), label).toBeCloseTo(expected, 6);
    }
    expect(angularDistance(35.6, 139.7, -33.8, 151.2)).toBeCloseTo(
      angularDistance(-33.8, 151.2, 35.6, 139.7),
      12,
    );
  });
});

describe("APPROXIMATE radius conversion", () => {
  it("turns metres into an arc, refusing unusable values and capping the sphere", () => {
    const cases: [string, number | null, number][] = [
      ["missing", null, 0],
      ["zero", 0, 0],
      ["negative", -500, 0],
      ["not a number", Number.NaN, 0],
      ["a quarter of the circumference", (Math.PI / 2) * EARTH_RADIUS_METERS, 90],
      // A radius larger than half the circumference would wrap around the sphere.
      ["absurdly large", 1e12, 180],
    ];
    for (const [label, meters, expected] of cases) {
      expect(degreeRadiusForMeters(meters), label).toBeCloseTo(expected, 6);
    }
    const realistic = degreeRadiusForMeters(5_000);
    expect(realistic).toBeGreaterThan(0);
    expect(realistic).toBeLessThan(0.1);
  });
});

describe("geodesic circle", () => {
  it("is closed, at a constant angular distance, and wraps the antimeridian", () => {
    const ring = geodesicCircleRing(48.85, 2.35, 2, 32);
    expect(ring[0]).toEqual(ring[ring.length - 1]);
    for (const [lng, lat] of ring) {
      expect(toDegrees(angularDistance(48.85, 2.35, lat, lng))).toBeCloseTo(2, 6);
    }
    const across = geodesicCircleRing(0, 179.5, 1, 32);
    expect(across.every(([lng]) => lng >= -180 && lng < 180)).toBe(true);
    expect(across.some(([lng]) => lng > 179)).toBe(true);
    expect(across.some(([lng]) => lng < -179)).toBe(true);

    // One degree of arc costs far more longitude at 70°N than at the equator, so
    // a naive flat-degree ellipse would draw a badly wrong zone up north.
    const span = (latitude: number) => {
      const longitudes = geodesicCircleRing(latitude, 0, 1, 64).map(([lng]) => lng);
      return Math.max(...longitudes) - Math.min(...longitudes);
    };
    expect(span(70)).toBeGreaterThan(span(0) * 2);
  });
});

describe("honest precision", () => {
  const set = [
    place({ id: "exact", precision: "EXACT", approximationRadiusMeters: 5_000 }),
    place({ id: "probable", precision: "PROBABLE", approximationRadiusMeters: 5_000 }),
    place({ id: "zone", precision: "APPROXIMATE", approximationRadiusMeters: 5_000 }),
    place({ id: "rejected", precision: "APPROXIMATE", approximationRadiusMeters: 5_000, reviewStatus: "REJECTED" }),
    place({ id: "broken", latitude: Number.NaN }),
  ];

  it("renders points and zones from the stored precision only", () => {
    const points = toGlobePoints(set);
    const zones = toGlobeZones(set);

    // REJECTED and unusable coordinates never reach the scene. UNKNOWN cannot
    // appear at all: it never creates a Place.
    expect(points.map((point) => point.id)).toEqual(["exact", "probable", "zone"]);
    // A stored radius must not widen an EXACT or PROBABLE place into an area.
    expect(points.find((point) => point.id === "exact")?.radiusDegrees).toBe(0);
    expect(points.find((point) => point.id === "probable")?.radiusDegrees).toBe(0);
    expect(points.find((point) => point.id === "zone")?.radiusDegrees).toBeGreaterThan(0);
    // Only APPROXIMATE gets a real area, sized from its own radius.
    expect(zones.map((zone) => zone.id)).toEqual(["zone"]);
    // …and an APPROXIMATE place with no usable radius is skipped, not invented.
    expect(toGlobeZones([place({ precision: "APPROXIMATE", approximationRadiusMeters: null })])).toEqual([]);
    expect(toGlobeZones([place({ precision: "APPROXIMATE", approximationRadiusMeters: 0 })])).toEqual([]);
  });

  it("marks the selection, normalizes coordinates and leaves the input untouched", () => {
    const input = [place({ id: "a", longitude: 200 }), place({ id: "b" })];
    const snapshot = structuredClone(input);
    const points = toGlobePoints(input, "a");
    expect(points[0]).toMatchObject({ id: "a", selected: true, lng: -160 });
    expect(points[1].selected).toBe(false);
    expect(input).toEqual(snapshot);
  });
});

describe("aggregation", () => {
  const rome = place({ id: "r1", countryCode: "IT", country: "Italie", latitude: 41.9, longitude: 12.5 });
  const milan = place({ id: "r2", countryCode: "IT", country: "Italie", latitude: 45.5, longitude: 9.2 });
  const paris = place({ id: "f1", countryCode: "FR", country: "France", latitude: 48.9, longitude: 2.35 });
  const tokyo = place({ id: "j1", countryCode: "JP", country: "Japon", latitude: 35.7, longitude: 139.7 });

  it("groups by country and continent, deterministically and without losing anyone", () => {
    const byCountry = aggregateByCountry([rome, milan, paris, tokyo]);
    expect(byCountry.map((cluster) => [cluster.key, cluster.count])).toEqual([["IT", 2], ["FR", 1], ["JP", 1]]);
    expect(byCountry[0]).toMatchObject({ label: "Italie", placeIds: ["r1", "r2"] });

    const byContinent = aggregateByContinent([rome, milan, paris, tokyo]);
    expect(byContinent.map((cluster) => [cluster.key, cluster.count])).toEqual([["EU", 3], ["AS", 1]]);
    expect(byContinent[0].label).toBe("Europe");

    // Same input, same scene — the tests below could not assert otherwise.
    expect(aggregateByCountry([tokyo, paris, rome, milan])).toEqual(byCountry);
  });

  it("keeps counts complete: unknown country bucketed, REJECTED excluded", () => {
    const clusters = aggregateByCountry([
      rome,
      place({ id: "x1", countryCode: null, country: null }),
      place({ id: "gone", countryCode: "IT", reviewStatus: "REJECTED" }),
    ]);
    expect(clusters.reduce((sum, cluster) => sum + cluster.count, 0)).toBe(2);
    expect(clusters.some((cluster) => cluster.key === UNKNOWN_GROUP_KEY)).toBe(true);
  });

  it("centres a cluster through the sphere, not by averaging longitudes", () => {
    // Naive numeric averaging of 179 and -179 gives 0 — the Gulf of Guinea.
    const dateLine = sphericalCentroid([{ lat: 0, lng: 179 }, { lat: 0, lng: -179 }]);
    expect(Math.abs(dateLine.lng)).toBeGreaterThan(179);
    expect(dateLine.lat).toBeCloseTo(0, 9);

    expect(sphericalCentroid([{ lat: 89, lng: 0 }, { lat: 89, lng: 180 }]).lat).toBeCloseTo(90, 6);
    const single = sphericalCentroid([{ lat: 48.85, lng: 2.35 }]);
    expect(single.lat).toBeCloseTo(48.85, 9);
    expect(single.lng).toBeCloseTo(2.35, 9);
    // Antipodal points cancel out; fall back rather than return a meaningless (0,0).
    expect(sphericalCentroid([{ lat: 0, lng: 0 }, { lat: 0, lng: 180 }])).toEqual({ lat: 0, lng: 0 });
    expect(sphericalCentroid([])).toEqual({ lat: 0, lng: 0 });
  });
});

describe("level of detail", () => {
  const many = (count: number, countryCode: string) =>
    Array.from({ length: count }, (_, index) =>
      place({ id: `${countryCode}${index}`, countryCode, latitude: index % 60, longitude: index % 170 }),
    );

  it("aggregates far out, resolves to places close in, and never counts a REJECTED place", () => {
    const levels: [number, string][] = [[2.5, "continent"], [1.0, "country"], [0.3, "place"], [Number.NaN, "continent"]];
    for (const [altitude, expected] of levels) {
      expect(detailLevelForAltitude(altitude), `altitude ${altitude}`).toBe(expected);
    }

    const places = [...many(20, "FR"), ...many(20, "IT"), place({ id: "gone", countryCode: "FR", reviewStatus: "REJECTED" })];

    const world = buildGlobeScene(places, { altitude: 2.5 });
    expect(world.level).toBe("continent");
    expect(world.clusters.reduce((sum, cluster) => sum + cluster.count, 0)).toBe(40);

    const country = buildGlobeScene(places, { altitude: 1.0 });
    expect(country.clusters.map((cluster) => cluster.key).sort()).toEqual(["FR", "IT"]);

    const close = buildGlobeScene(places, { altitude: 0.2 });
    expect(close.level).toBe("place");
    expect(close.points).toHaveLength(40);
  });

  it("skips aggregation for a small set and whenever a place is selected", () => {
    const small = many(AGGREGATION_MIN_PLACES - 1, "FR");
    expect(buildGlobeScene(small, { altitude: 2.5 }).level).toBe("place");

    // A selection must always resolve to the place the user asked for, not to
    // the bubble that contains it.
    const large = many(40, "FR");
    const selected = buildGlobeScene(large, { altitude: 2.5, selectedId: large[7].id });
    expect(selected.level).toBe("place");
    expect(selected.points.find((point) => point.id === large[7].id)?.selected).toBe(true);
  });
});
