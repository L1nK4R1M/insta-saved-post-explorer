import { describe, expect, it } from "vitest";

import {
  EMPTY_FILTERS,
  countActiveFilters,
  filterPlaces,
  isMappable,
  parsePlacesUrlState,
  serializePlacesUrlState,
  toggleValue,
  type PlacesFilters,
} from "@/features/places/query-state";
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

describe("places URL state", () => {
  it("parses every filter from the query string", () => {
    const state = parsePlacesUrlState(
      new URLSearchParams("q=nobu&theme=Voyages,Restaurant&categories=cafe,restaurant&precision=EXACT,APPROXIMATE&review=needs_review&country=ae,fr&placeId=abc"),
    );
    expect(state).toEqual({
      q: "nobu",
      themes: ["Voyages", "Restaurant"],
      categories: ["cafe", "restaurant"],
      precisions: ["EXACT", "APPROXIMATE"],
      reviews: ["needs_review"],
      countryCodes: ["AE", "FR"],
      placeId: "abc",
    });
  });

  it("normalizes accented and lower-case themes and drops unknown values", () => {
    const state = parsePlacesUrlState(
      new URLSearchParams("theme=voyages,Cuisine&categories=cafe,brunch&precision=exact,NOPE&review=bogus&country=zzz,FR"),
    );
    expect(state.themes).toEqual(["Voyages"]);
    expect(state.categories).toEqual(["cafe"]); // "brunch" is not a group key
    expect(state.precisions).toEqual(["EXACT"]);
    expect(state.reviews).toEqual([]);
    expect(state.countryCodes).toEqual(["FR"]);
  });

  it("returns an empty state for an empty query string", () => {
    expect(parsePlacesUrlState(new URLSearchParams())).toEqual({ ...EMPTY_FILTERS, placeId: null });
  });

  it("serializes only the non-empty parts and round-trips", () => {
    expect(serializePlacesUrlState({ ...EMPTY_FILTERS, placeId: null })).toBe("");
    const state = {
      q: "rome",
      themes: ["Voyages" as const],
      categories: ["cafe" as const],
      precisions: ["PROBABLE" as const],
      reviews: ["confirmed" as const],
      countryCodes: ["IT"],
      placeId: "xyz",
    };
    const serialized = serializePlacesUrlState(state);
    expect(parsePlacesUrlState(new URLSearchParams(serialized))).toEqual(state);
  });

  it("counts active filters including the search term", () => {
    expect(countActiveFilters(EMPTY_FILTERS)).toBe(0);
    expect(
      countActiveFilters({ ...EMPTY_FILTERS, q: "a", themes: ["Voyages"], categories: ["cafe", "bar"] }),
    ).toBe(4);
  });

  it("toggles a value in and out of a list", () => {
    expect(toggleValue(["a"], "b")).toEqual(["a", "b"]);
    expect(toggleValue(["a", "b"], "a")).toEqual(["b"]);
  });
});

describe("places filtering", () => {
  const nobu = place();
  const cafe = place({ id: "p2", displayName: "Bar San Calisto", categoryGroup: "cafe", category: "catering.cafe", city: "Rome", country: "Italie", countryCode: "IT", precision: "PROBABLE", sourceThemes: ["Voyages"] });
  const zone = place({ id: "p3", displayName: "Caldeira de Santorin", categoryGroup: "plage", category: "beach", city: "Oia", country: "Grèce", countryCode: "GR", precision: "APPROXIMATE", approximationRadiusMeters: 5000, sourceThemes: ["Voyages"], reviewStatus: "CONFLICT" });
  const confirmed = place({ id: "p4", displayName: "Tsukiji", categoryGroup: "patisserie", category: "catering.bakery", city: "Tokyo", country: "Japon", countryCode: "JP", reviewStatus: "CONFIRMED", isUserConfirmed: true, sourceThemes: ["Restaurant"] });
  const all = [nobu, cafe, zone, confirmed];

  const withFilters = (overrides: Partial<PlacesFilters>) => filterPlaces(all, { ...EMPTY_FILTERS, ...overrides });

  it("returns everything when no filter is active", () => {
    expect(withFilters({})).toHaveLength(4);
  });

  it("searches name, city and country without accents or case", () => {
    expect(withFilters({ q: "santorin" }).map((p) => p.id)).toEqual(["p3"]);
    expect(withFilters({ q: "GRECE" }).map((p) => p.id)).toEqual(["p3"]);
    expect(withFilters({ q: "tokyo" }).map((p) => p.id)).toEqual(["p4"]);
  });

  it("filters by source theme", () => {
    expect(withFilters({ themes: ["Restaurant"] }).map((p) => p.id).sort()).toEqual(["p1", "p4"]);
  });

  it("filters by several place types at once", () => {
    expect(withFilters({ categories: ["cafe", "plage"] }).map((p) => p.id).sort()).toEqual(["p2", "p3"]);
  });

  it("filters by precision", () => {
    expect(withFilters({ precisions: ["APPROXIMATE"] }).map((p) => p.id)).toEqual(["p3"]);
  });

  it("separates places needing review from confirmed ones", () => {
    expect(withFilters({ reviews: ["confirmed"] }).map((p) => p.id)).toEqual(["p4"]);
    expect(withFilters({ reviews: ["needs_review"] }).map((p) => p.id).sort()).toEqual(["p1", "p2", "p3"]);
  });

  it("filters by country", () => {
    expect(withFilters({ countryCodes: ["IT"] }).map((p) => p.id)).toEqual(["p2"]);
  });

  it("combines filters with AND across groups", () => {
    expect(withFilters({ themes: ["Voyages"], precisions: ["PROBABLE"] }).map((p) => p.id)).toEqual(["p2"]);
    expect(withFilters({ themes: ["Voyages"], categories: ["patisserie"] })).toHaveLength(0);
  });

  it("keeps rejected places off the map and list", () => {
    expect(isMappable(place({ reviewStatus: "REJECTED" }))).toBe(false);
    expect(isMappable(nobu)).toBe(true);
  });
});
