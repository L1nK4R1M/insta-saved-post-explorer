import { describe, expect, it } from "vitest";

import {
  decodeLibraryCursor,
  encodeLibraryCursor,
  parseLibraryQuery,
  parseLibrarySearchParams,
} from "@/features/library/query-state";

describe("parseLibrarySearchParams", () => {
  it("restaure recherche, tags, mode, tri et limite depuis l'URL", () => {
    const query = parseLibrarySearchParams(
      new URLSearchParams(
        "q=gateau&tags=Dessert%20prot%C3%A9in%C3%A9%2CChocolat&tagMode=or&type=carousel&sort=author&limit=48",
      ),
    );

    expect(query).toMatchObject({
      search: "gateau",
      tags: ["Dessert protéiné", "Chocolat"],
      tagMode: "or",
      contentType: "carousel",
      sort: "author",
      limit: 48,
      cursor: null,
    });
  });

  it("priorise les tags repetes et deduplique les valeurs", () => {
    const params = new URLSearchParams("tags=ignore&tag=Pistache&tag=Pistache&tag=Caf%C3%A9");

    expect(parseLibrarySearchParams(params).tags).toEqual(["Pistache", "Café"]);
  });

  it("rejette les limites et modes hors contrat", () => {
    expect(() => parseLibraryQuery({ limit: 101 })).toThrow();
    expect(() => parseLibraryQuery({ tagMode: "xor" })).toThrow();
    expect(() => parseLibraryQuery({ sort: "random" })).toThrow();
    expect(() => parseLibraryQuery({ contentType: "story" })).toThrow();
  });
});

describe("curseur de navigation", () => {
  it("fait un aller-retour sans perte avec des caracteres Unicode", () => {
    const cursor = {
      version: 1 as const,
      sort: "author" as const,
      value: "élodie",
      id: "post_éclair",
    };

    expect(decodeLibraryCursor(encodeLibraryCursor(cursor), "author")).toEqual(cursor);
  });

  it("refuse un curseur utilise avec un autre tri", () => {
    const encoded = encodeLibraryCursor({
      version: 1,
      sort: "newest",
      value: "2026-07-10T00:00:00.000Z",
      id: "post_1",
    });

    expect(() => decodeLibraryCursor(encoded, "oldest")).toThrow(/Curseur invalide/i);
  });

  it("refuse une valeur qui n'est pas un curseur", () => {
    expect(() => decodeLibraryCursor("pas-un-curseur", "newest")).toThrow(
      /Curseur invalide/i,
    );
  });
});
