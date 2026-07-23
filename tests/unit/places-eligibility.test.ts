// @vitest-environment node

import { describe, expect, it } from "vitest";

import { PLACES_ELIGIBLE_THEMES, isPlacesEligibleTheme } from "@/lib/places/eligibility";

describe("places theme eligibility", () => {
  it("keeps exactly Voyages and Restaurant as canonical eligible themes", () => {
    expect(PLACES_ELIGIBLE_THEMES).toEqual(["Voyages", "Restaurant"]);
  });

  it("accepts the canonical themes", () => {
    expect(isPlacesEligibleTheme("Voyages")).toBe(true);
    expect(isPlacesEligibleTheme("Restaurant")).toBe(true);
  });

  it("normalizes case variants", () => {
    expect(isPlacesEligibleTheme("voyages")).toBe(true);
    expect(isPlacesEligibleTheme("VOYAGES")).toBe(true);
    expect(isPlacesEligibleTheme("restaurant")).toBe(true);
    expect(isPlacesEligibleTheme("RESTAURANT")).toBe(true);
  });

  it("normalizes accent variants", () => {
    expect(isPlacesEligibleTheme("Vöyagés")).toBe(true);
    expect(isPlacesEligibleTheme("Réstaurant")).toBe(true);
  });

  it("normalizes surrounding whitespace", () => {
    expect(isPlacesEligibleTheme("  Voyages  ")).toBe(true);
    expect(isPlacesEligibleTheme("\tRestaurant\n")).toBe(true);
  });

  it("rejects null, undefined, and empty values", () => {
    expect(isPlacesEligibleTheme(null)).toBe(false);
    expect(isPlacesEligibleTheme(undefined)).toBe(false);
    expect(isPlacesEligibleTheme("")).toBe(false);
    expect(isPlacesEligibleTheme("   ")).toBe(false);
  });

  it("rejects neighboring themes without semantic widening", () => {
    expect(isPlacesEligibleTheme("Voyage")).toBe(false);
    expect(isPlacesEligibleTheme("Restaurants")).toBe(false);
    expect(isPlacesEligibleTheme("Cuisine")).toBe(false);
    expect(isPlacesEligibleTheme("Gastronomie")).toBe(false);
    expect(isPlacesEligibleTheme("Sport")).toBe(false);
  });

  it("rejects compound or partial matches", () => {
    expect(isPlacesEligibleTheme("Voyages Restaurant")).toBe(false);
    expect(isPlacesEligibleTheme("Mes Voyages")).toBe(false);
    expect(isPlacesEligibleTheme("Restaurant étoilé")).toBe(false);
  });
});
