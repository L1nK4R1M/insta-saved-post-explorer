import { describe, expect, it } from "vitest";

import { enrichSyncedPost, SYNC_MAIN_THEMES } from "@/lib/sync/enrich-post";

describe("enrichSyncedPost", () => {
  it("classe une recette sucrée et produit au moins cinq tags distincts", () => {
    const result = enrichSyncedPost("High protein chocolate brownie with pistachio. #NinjaCreami #HealthyDessert");

    expect(result.mainTheme).toBe("Sucré");
    expect(result.tags).toEqual(expect.arrayContaining(["Chocolat", "Brownie", "Pistache", "Recette protéinée"]));
    expect(new Set(result.tags.map((tag) => tag.toLocaleLowerCase("fr"))).size).toBe(result.tags.length);
    expect(result.tags.length).toBeGreaterThanOrEqual(5);
    expect(result.tags).not.toContain(result.mainTheme);
  });

  it("reconnaît les thèmes restaurant, voyage, sport et salé", () => {
    expect(enrichSyncedPost("The best brunch restaurant and coffee shop in Brussels").mainTheme).toBe("Restaurant");
    expect(enrichSyncedPost("Tokyo travel itinerary and hotel guide").mainTheme).toBe("Voyages");
    expect(enrichSyncedPost("Full body gym workout and strength training").mainTheme).toBe("Sport");
    expect(enrichSyncedPost("Easy chicken pasta recipe with homemade sauce").mainTheme).toBe("Salé");
  });

  it("utilise Divers comme repli et filtre les hashtags génériques", () => {
    const result = enrichSyncedPost("A beautiful moment. #viral #reels #Inspiration");

    expect(result.mainTheme).toBe("Divers");
    expect(result.tags).not.toEqual(expect.arrayContaining(["Viral", "Reels"]));
    expect(result.tags.length).toBeGreaterThanOrEqual(5);
  });

  it("ne retourne que les thèmes principaux supportés", () => {
    expect(SYNC_MAIN_THEMES).toContain(enrichSyncedPost("DIY tutorial and practical tips").mainTheme);
  });
});
