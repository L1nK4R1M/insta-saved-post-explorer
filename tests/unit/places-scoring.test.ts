import { describe, expect, it } from "vitest";

import type { PlaceCandidate } from "@/lib/places/candidates";
import { scoreResolvedCandidate, type ScoringInput } from "@/lib/places/scoring";
import type { ResolvedPlaceCandidate } from "@/server/places/resolvers/types";

function candidate(overrides: Partial<PlaceCandidate> = {}): PlaceCandidate {
  return {
    name: "Nobu Dubai",
    city: "Dubai",
    region: null,
    country: "United Arab Emirates",
    category: "restaurant",
    confidence: 0.95,
    evidence: [],
    ...overrides,
  };
}

function resolved(overrides: Partial<ResolvedPlaceCandidate> = {}): ResolvedPlaceCandidate {
  return {
    provider: "geoapify",
    providerPlaceId: "geo-1",
    displayName: "Nobu Dubai",
    category: "catering.restaurant",
    address: "Atlantis, Dubai",
    city: "Dubai",
    region: null,
    country: "United Arab Emirates",
    countryCode: "AE",
    latitude: 25.1,
    longitude: 55.1,
    providerResultType: "amenity",
    providerRank: 0.9,
    attribution: "© Geoapify",
    ...overrides,
  };
}

function input(c: Partial<PlaceCandidate>, r: Partial<ResolvedPlaceCandidate>): ScoringInput {
  return { candidate: candidate(c), resolved: resolved(r) };
}

describe("scoreResolvedCandidate", () => {
  it("classifies a specific verified POI as EXACT with no radius", () => {
    const result = scoreResolvedCandidate(input({}, {}));
    expect(result.precision).toBe("EXACT");
    expect(result.approximationRadiusMeters).toBeNull();
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it("classifies an incomplete but specific match as PROBABLE with no radius", () => {
    const result = scoreResolvedCandidate(
      input(
        { name: "Sushi Bar", city: "Tokyo", region: null, country: null, confidence: 0.8 },
        { displayName: "Sushi Bar", city: "Tokyo", country: "Japan", countryCode: "JP", providerResultType: "amenity" },
      ),
    );
    expect(result.precision).toBe("PROBABLE");
    expect(result.approximationRadiusMeters).toBeNull();
    expect(result.confidence).toBeGreaterThanOrEqual(0.75);
    expect(result.confidence).toBeLessThan(0.9);
  });

  it("classifies a city-level area match as APPROXIMATE with a mandatory radius", () => {
    const result = scoreResolvedCandidate(
      input(
        { name: null, city: "Kyoto", region: null, country: "Japan", confidence: 0.7 },
        { displayName: "Kyoto", city: "Kyoto", country: "Japan", countryCode: "JP", providerResultType: "city" },
      ),
    );
    expect(result.precision).toBe("APPROXIMATE");
    expect(result.approximationRadiusMeters).toBe(25_000);
  });

  it.each([
    ["suburb", 5_000],
    ["district", 5_000],
    ["city", 25_000],
    ["postcode", 25_000],
    ["county", 50_000],
    ["state", 150_000],
  ])("uses the documented radius for area type %s", (resultType, radius) => {
    const result = scoreResolvedCandidate(
      input(
        { name: null, city: "Somewhere", region: null, country: "Japan", confidence: 0.8 },
        { city: "Somewhere", country: "Japan", countryCode: "JP", providerResultType: resultType },
      ),
    );
    expect(result.precision).toBe("APPROXIMATE");
    expect(result.approximationRadiusMeters).toBe(radius);
  });

  it("returns UNKNOWN for a country-only match and creates no radius", () => {
    const result = scoreResolvedCandidate(
      input(
        { name: null, city: null, region: null, country: "Japan", confidence: 0.9 },
        { displayName: "Japan", city: null, country: "Japan", countryCode: "JP", providerResultType: "country" },
      ),
    );
    expect(result.precision).toBe("UNKNOWN");
    expect(result.approximationRadiusMeters).toBeNull();
    expect(result.reasons).toContain("country_only");
  });

  it("returns UNKNOWN when candidate and provider countries contradict", () => {
    const result = scoreResolvedCandidate(
      input(
        { name: "Nobu", city: "Dubai", region: null, country: "France", confidence: 0.9 },
        { displayName: "Nobu", city: "Dubai", country: "Spain", countryCode: "ES", providerResultType: "amenity" },
      ),
    );
    expect(result.precision).toBe("UNKNOWN");
    expect(result.reasons).toContain("country_contradiction");
  });

  it("returns UNKNOWN when a specific match scores below the PROBABLE threshold", () => {
    const result = scoreResolvedCandidate(
      input(
        { name: "Vague place", city: null, region: null, country: null, confidence: 0.4 },
        { displayName: "Something else", city: null, country: null, countryCode: null, providerResultType: "amenity" },
      ),
    );
    expect(result.precision).toBe("UNKNOWN");
  });

  it("returns UNKNOWN for an unrecognized provider result type", () => {
    const result = scoreResolvedCandidate(input({}, { providerResultType: "galaxy" }));
    expect(result.precision).toBe("UNKNOWN");
  });

  it("never returns a radius for a non-approximate precision", () => {
    for (const type of ["amenity", "country", "galaxy"]) {
      const result = scoreResolvedCandidate(input({}, { providerResultType: type }));
      if (result.precision !== "APPROXIMATE") {
        expect(result.approximationRadiusMeters).toBeNull();
      }
    }
  });

  it("clamps confidence to the [0,1] range", () => {
    const result = scoreResolvedCandidate(input({}, {}));
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it("is deterministic and does not mutate its inputs", () => {
    const arg = input({}, {});
    const frozenCandidate = { ...arg.candidate };
    const frozenResolved = { ...arg.resolved };
    const a = scoreResolvedCandidate(arg);
    const b = scoreResolvedCandidate(arg);
    expect(a).toEqual(b);
    expect(arg.candidate).toEqual(frozenCandidate);
    expect(arg.resolved).toEqual(frozenResolved);
  });
});
