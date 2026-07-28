import { describe, expect, it } from "vitest";

import { continentCodeForCountry } from "@/lib/places/continents";

describe("continentCodeForCountry", () => {
  it.each([
    ["BE", "EU"],
    ["JP", "AS"],
    ["TR", "AS"],
    ["AE", "AS"],
    ["US", "NA"],
    ["BR", "SA"],
    ["ZA", "AF"],
    ["AU", "OC"],
  ])("maps %s to %s", (code, continent) => {
    expect(continentCodeForCountry(code)).toBe(continent);
  });

  it("is case- and whitespace-insensitive", () => {
    expect(continentCodeForCountry(" be ")).toBe("EU");
    expect(continentCodeForCountry("jp")).toBe("AS");
  });

  it("returns null for unknown, empty, or null country codes", () => {
    expect(continentCodeForCountry("XX")).toBeNull();
    expect(continentCodeForCountry("")).toBeNull();
    expect(continentCodeForCountry(null)).toBeNull();
    expect(continentCodeForCountry(undefined)).toBeNull();
  });
});
