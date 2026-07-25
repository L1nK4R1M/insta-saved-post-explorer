import { describe, expect, it } from "vitest";

import {
  PLACE_CATEGORY_GROUPS,
  groupForRawCategory,
  isPlaceCategoryGroup,
  parseCategoryGroups,
  rawCategoryPrefixesForGroups,
} from "@/lib/places/categories";

describe("place category groups", () => {
  it("exposes stable group keys", () => {
    expect(PLACE_CATEGORY_GROUPS.map((group) => group.key)).toEqual([
      "restaurant",
      "cafe",
      "patisserie",
      "bar",
      "hotel",
      "plage",
      "monument",
    ]);
  });

  it("maps Geoapify catering categories to their group", () => {
    expect(groupForRawCategory("catering.restaurant")).toBe("restaurant");
    expect(groupForRawCategory("catering.fast_food")).toBe("restaurant");
    expect(groupForRawCategory("catering.cafe")).toBe("cafe");
    expect(groupForRawCategory("catering.bakery")).toBe("patisserie");
    expect(groupForRawCategory("catering.bar")).toBe("bar");
    expect(groupForRawCategory("catering.pub")).toBe("bar");
  });

  it("maps travel categories to their group", () => {
    expect(groupForRawCategory("accommodation.hotel")).toBe("hotel");
    expect(groupForRawCategory("beach")).toBe("plage");
    expect(groupForRawCategory("tourism.attraction")).toBe("monument");
    expect(groupForRawCategory("tourism.sights.monument")).toBe("monument");
  });

  it("is case and whitespace insensitive", () => {
    expect(groupForRawCategory("  CATERING.Cafe  ")).toBe("cafe");
  });

  it("returns null for an unknown or empty category", () => {
    expect(groupForRawCategory("commercial.supermarket")).toBeNull();
    expect(groupForRawCategory(null)).toBeNull();
    expect(groupForRawCategory("")).toBeNull();
  });

  // Brunch has no Geoapify category of its own; the owner decided to fold it into
  // café until a dedicated source (internal tags) exists.
  it("folds brunch into the cafe group", () => {
    expect(groupForRawCategory("catering.cafe.brunch")).toBe("cafe");
    const cafe = PLACE_CATEGORY_GROUPS.find((group) => group.key === "cafe");
    expect(cafe?.includesBrunch).toBe(true);
  });

  it("resolves the raw prefixes used to query a set of groups", () => {
    expect(rawCategoryPrefixesForGroups(["cafe"])).toEqual(["catering.cafe", "catering.coffee"]);
    const both = rawCategoryPrefixesForGroups(["restaurant", "bar"]);
    expect(both).toContain("catering.restaurant");
    expect(both).toContain("catering.bar");
    expect(both).toContain("catering.pub");
  });

  it("parses a comma-separated group list, dropping unknown values", () => {
    expect(parseCategoryGroups("cafe,restaurant")).toEqual(["cafe", "restaurant"]);
    expect(parseCategoryGroups("cafe, nope ,bar")).toEqual(["cafe", "bar"]);
    expect(parseCategoryGroups("")).toEqual([]);
    expect(parseCategoryGroups(undefined)).toEqual([]);
  });

  it("deduplicates parsed groups and prefixes", () => {
    expect(parseCategoryGroups("cafe,cafe")).toEqual(["cafe"]);
    expect(rawCategoryPrefixesForGroups(["cafe", "cafe"])).toEqual(["catering.cafe", "catering.coffee"]);
  });

  it("recognizes valid group keys", () => {
    expect(isPlaceCategoryGroup("cafe")).toBe(true);
    expect(isPlaceCategoryGroup("brunch")).toBe(false);
  });
});
