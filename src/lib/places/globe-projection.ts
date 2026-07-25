import { continentCodeForCountry, type ContinentCode } from "@/lib/places/continents";
import type { PlacesMapItem } from "@/server/places/map-view";

// Pure 3D view model for the Places globe.
//
// This module knows nothing about React, Three.js or globe.gl: it turns the
// existing owner-scoped `PlacesMapItem` into plain numbers and groups. Keeping it
// pure is what makes the honest-precision rules and the aggregation testable
// without a browser or a WebGL context, and it is the reason the engine stays
// confined to a single component (NFR-I-08).
//
// Conventions, fixed here once so every caller agrees:
// - latitude in [-90, 90], positive north;
// - longitude in [-180, 180), positive east, wrapped rather than clamped;
// - the sphere is right-handed with +Y through the north pole and +Z through
//   (lat 0, lon 0), which is the convention three.js/globe.gl use for a globe.

export const EARTH_RADIUS_METERS = 6_371_008.8;

export type Vec3 = { x: number; y: number; z: number };

export function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function toDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}

// Wrap a longitude into [-180, 180). 180 itself maps to -180 so the antimeridian
// has exactly one representation and two points on it never look different.
export function normalizeLongitude(longitude: number): number {
  if (!Number.isFinite(longitude)) return 0;
  const wrapped = ((((longitude + 180) % 360) + 360) % 360) - 180;
  // -0 is a valid float but compares oddly in snapshots; normalize it away.
  return Object.is(wrapped, -0) ? 0 : wrapped;
}

// Latitudes are clamped, not wrapped: crossing a pole would also flip the
// longitude, and no data source we accept can produce such a value.
export function clampLatitude(latitude: number): number {
  if (!Number.isFinite(latitude)) return 0;
  return Math.min(90, Math.max(-90, latitude));
}

export function latLonToVec3(latitude: number, longitude: number, radius = 1): Vec3 {
  const phi = toRadians(90 - clampLatitude(latitude));
  const theta = toRadians(normalizeLongitude(longitude));
  const sinPhi = Math.sin(phi);
  return {
    x: radius * sinPhi * Math.sin(theta),
    y: radius * Math.cos(phi),
    z: radius * sinPhi * Math.cos(theta),
  };
}

// Great-circle distance between two points, in radians. Uses the haversine form
// because it stays accurate for the short distances between nearby places, where
// the spherical law of cosines loses precision.
export function angularDistance(
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number,
): number {
  const lat1 = toRadians(clampLatitude(aLat));
  const lat2 = toRadians(clampLatitude(bLat));
  const dLat = lat2 - lat1;
  const dLon = toRadians(normalizeLongitude(bLon) - normalizeLongitude(aLon));
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Ground distance in metres to the angular radius a ring must span on the globe.
// APPROXIMATE places are drawn from this, never as an exact point (FR-I-10).
export function angularRadiusForMeters(meters: number | null | undefined): number {
  if (meters == null || !Number.isFinite(meters) || meters <= 0) return 0;
  // A radius larger than half the circumference would wrap around the sphere.
  const capped = Math.min(meters, Math.PI * EARTH_RADIUS_METERS);
  return capped / EARTH_RADIUS_METERS;
}

// Degrees of arc, which is what globe.gl's ring/point sizing expects.
export function degreeRadiusForMeters(meters: number | null | undefined): number {
  return toDegrees(angularRadiusForMeters(meters));
}

// ---------------------------------------------------------------------------
// Rendering eligibility
// ---------------------------------------------------------------------------

// The globe renders exactly what the 2D map renders. UNKNOWN never creates a
// Place so it cannot appear here, and REJECTED is excluded by the same rule the
// 2D view applies — this predicate exists so the invariant is asserted on the 3D
// path too rather than being inherited by accident.
export function isRenderableOnGlobe(place: PlacesMapItem): boolean {
  if (place.reviewStatus === "REJECTED") return false;
  if (!Number.isFinite(place.latitude) || !Number.isFinite(place.longitude)) return false;
  return Math.abs(place.latitude) <= 90;
}

export type GlobePoint = {
  id: string;
  lat: number;
  lng: number;
  /** Angular radius in degrees; 0 for a point, > 0 for an APPROXIMATE zone. */
  radiusDegrees: number;
  precision: PlacesMapItem["precision"];
  selected: boolean;
};

// Scene data for the individual places. Coordinates are normalized once here so
// the component never re-derives them.
export function toGlobePoints(
  places: readonly PlacesMapItem[],
  selectedId: string | null = null,
): GlobePoint[] {
  const points: GlobePoint[] = [];
  for (const place of places) {
    if (!isRenderableOnGlobe(place)) continue;
    points.push({
      id: place.id,
      lat: clampLatitude(place.latitude),
      lng: normalizeLongitude(place.longitude),
      radiusDegrees:
        place.precision === "APPROXIMATE" ? degreeRadiusForMeters(place.approximationRadiusMeters) : 0,
      precision: place.precision,
      selected: place.id === selectedId,
    });
  }
  return points;
}

// A closed ring of [lng, lat] pairs approximating the circle of given angular
// radius around a centre — the honest footprint of an APPROXIMATE place.
//
// It is computed on the sphere, not in flat degrees, because a fixed longitude
// offset shrinks with latitude: a naive ellipse would draw a Reykjavík zone far
// too wide. The ring is returned in GeoJSON order (longitude first) so it can be
// handed to a polygon layer as-is.
export function geodesicCircleRing(
  latitude: number,
  longitude: number,
  radiusDegrees: number,
  segments = 48,
): [number, number][] {
  const steps = Math.max(8, Math.floor(segments));
  const lat0 = toRadians(clampLatitude(latitude));
  const lon0 = toRadians(normalizeLongitude(longitude));
  const angular = toRadians(Math.max(0, radiusDegrees));
  const sinLat0 = Math.sin(lat0);
  const cosLat0 = Math.cos(lat0);
  const sinR = Math.sin(angular);
  const cosR = Math.cos(angular);

  const ring: [number, number][] = [];
  for (let i = 0; i <= steps; i += 1) {
    // The last point repeats the first so the ring is explicitly closed.
    const bearing = (2 * Math.PI * (i % steps)) / steps;
    const lat = Math.asin(sinLat0 * cosR + cosLat0 * sinR * Math.cos(bearing));
    const lon =
      lon0 +
      Math.atan2(Math.sin(bearing) * sinR * cosLat0, cosR - sinLat0 * Math.sin(lat));
    ring.push([normalizeLongitude(toDegrees(lon)), clampLatitude(toDegrees(lat))]);
  }
  return ring;
}

export type GlobeZone = {
  id: string;
  ring: [number, number][];
  selected: boolean;
};

// APPROXIMATE places only. EXACT and PROBABLE are points and must never gain an
// area, even when a stale radius is stored on the row (FR-I-10).
export function toGlobeZones(
  places: readonly PlacesMapItem[],
  selectedId: string | null = null,
): GlobeZone[] {
  const zones: GlobeZone[] = [];
  for (const place of places) {
    if (!isRenderableOnGlobe(place) || place.precision !== "APPROXIMATE") continue;
    const radiusDegrees = degreeRadiusForMeters(place.approximationRadiusMeters);
    if (radiusDegrees <= 0) continue;
    zones.push({
      id: place.id,
      ring: geodesicCircleRing(place.latitude, place.longitude, radiusDegrees),
      selected: place.id === selectedId,
    });
  }
  return zones;
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

export type GlobeCluster = {
  key: string;
  label: string;
  lat: number;
  lng: number;
  count: number;
  placeIds: string[];
};

// Mean position of a set of coordinates, computed through the 3D centroid so a
// group straddling the antimeridian does not collapse onto the wrong meridian —
// averaging longitudes numerically would place a Fiji cluster in Africa.
export function sphericalCentroid(
  coordinates: readonly { lat: number; lng: number }[],
): { lat: number; lng: number } {
  if (coordinates.length === 0) return { lat: 0, lng: 0 };
  let x = 0;
  let y = 0;
  let z = 0;
  for (const { lat, lng } of coordinates) {
    const vec = latLonToVec3(lat, lng, 1);
    x += vec.x;
    y += vec.y;
    z += vec.z;
  }
  const length = Math.hypot(x, y, z);
  // Antipodal points cancel out; fall back to the first coordinate rather than
  // returning a meaningless (0, 0).
  if (length < 1e-9) {
    return { lat: clampLatitude(coordinates[0].lat), lng: normalizeLongitude(coordinates[0].lng) };
  }
  const lat = toDegrees(Math.asin(Math.min(1, Math.max(-1, y / length))));
  const lng = toDegrees(Math.atan2(x, z));
  return { lat, lng: normalizeLongitude(lng) };
}

type GroupKeyed = { key: string; label: string; place: PlacesMapItem };

function aggregate(entries: readonly GroupKeyed[]): GlobeCluster[] {
  const groups = new Map<string, { label: string; places: PlacesMapItem[] }>();
  for (const entry of entries) {
    const group = groups.get(entry.key);
    if (group) group.places.push(entry.place);
    else groups.set(entry.key, { label: entry.label, places: [entry.place] });
  }

  const clusters: GlobeCluster[] = [];
  for (const [key, group] of groups) {
    const centroid = sphericalCentroid(
      group.places.map((place) => ({ lat: place.latitude, lng: place.longitude })),
    );
    clusters.push({
      key,
      label: group.label,
      lat: centroid.lat,
      lng: centroid.lng,
      count: group.places.length,
      placeIds: group.places.map((place) => place.id),
    });
  }
  // Deterministic order: biggest first, then by key, so the same input always
  // produces the same scene and the tests can assert on it.
  return clusters.sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

// Places without a verified country code are grouped under a single explicit
// bucket instead of being dropped: the counts must always add up to the number
// of rendered places.
export const UNKNOWN_GROUP_KEY = "__unknown__";

export function aggregateByCountry(places: readonly PlacesMapItem[]): GlobeCluster[] {
  return aggregate(
    places.filter(isRenderableOnGlobe).map((place) => ({
      key: place.countryCode ?? UNKNOWN_GROUP_KEY,
      label: place.country ?? place.countryCode ?? "Sans pays",
      place,
    })),
  );
}

const CONTINENT_LABEL: Readonly<Record<ContinentCode, string>> = {
  AF: "Afrique",
  AN: "Antarctique",
  AS: "Asie",
  EU: "Europe",
  NA: "Amérique du Nord",
  OC: "Océanie",
  SA: "Amérique du Sud",
};

export function aggregateByContinent(places: readonly PlacesMapItem[]): GlobeCluster[] {
  return aggregate(
    places.filter(isRenderableOnGlobe).map((place) => {
      const code = continentCodeForCountry(place.countryCode);
      return {
        key: code ?? UNKNOWN_GROUP_KEY,
        label: code ? CONTINENT_LABEL[code] : "Sans continent",
        place,
      };
    }),
  );
}

// ---------------------------------------------------------------------------
// Level of detail
// ---------------------------------------------------------------------------

// globe.gl expresses the camera distance as an altitude in globe radii: ~2.5 is
// the default world view, and the smaller it gets the closer the camera is.
// These thresholds are the only place the drill-down rule lives, so it is
// deterministic and testable without a camera.
export const CONTINENT_ALTITUDE_MIN = 1.6;
export const COUNTRY_ALTITUDE_MIN = 0.75;

export type GlobeDetailLevel = "continent" | "country" | "place";

export function detailLevelForAltitude(altitude: number): GlobeDetailLevel {
  if (!Number.isFinite(altitude)) return "continent";
  if (altitude >= CONTINENT_ALTITUDE_MIN) return "continent";
  if (altitude >= COUNTRY_ALTITUDE_MIN) return "country";
  return "place";
}

// Below this many rendered places aggregation only adds indirection, so the
// individual points are shown straight away whatever the altitude.
export const AGGREGATION_MIN_PLACES = 12;

export type GlobeScene =
  | { level: "place"; points: GlobePoint[]; clusters: [] }
  | { level: "country" | "continent"; points: []; clusters: GlobeCluster[] };

export function buildGlobeScene(
  places: readonly PlacesMapItem[],
  options: { altitude: number; selectedId?: string | null },
): GlobeScene {
  const renderable = places.filter(isRenderableOnGlobe);
  const level = detailLevelForAltitude(options.altitude);

  // A selection always resolves to individual points: the user asked for one
  // specific place and must see it, not the bubble that contains it.
  if (level === "place" || renderable.length < AGGREGATION_MIN_PLACES || options.selectedId) {
    return { level: "place", points: toGlobePoints(renderable, options.selectedId ?? null), clusters: [] };
  }
  return level === "continent"
    ? { level: "continent", points: [], clusters: aggregateByContinent(renderable) }
    : { level: "country", points: [], clusters: aggregateByCountry(renderable) };
}
