import { describe, expect, it } from "vitest";
import { detectTagVariants } from "@/lib/tag-variants";

describe("tag variant suggestions", () => {
  it("suggests deterministic accent, plural and typo variants", () => {
    const tags = [{ id: "1", name: "Café" }, { id: "2", name: "Cafe" }, { id: "3", name: "Voyage" }, { id: "4", name: "Voyages" }, { id: "5", name: "Cuisine" }, { id: "6", name: "Cuisne" }];
    expect(detectTagVariants(tags)).toEqual(expect.arrayContaining([
      { tagId: "1", candidateId: "2", reason: "Même écriture normalisée" },
      { tagId: "3", candidateId: "4", reason: "Variante singulier/pluriel" },
      { tagId: "5", candidateId: "6", reason: "Orthographe très proche" },
    ]));
  });
  it("does not suggest unrelated short tags", () => {
    expect(detectTagVariants([{ id: "1", name: "IA" }, { id: "2", name: "Art" }])).toEqual([]);
  });
});
