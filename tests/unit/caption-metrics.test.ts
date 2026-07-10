import { describe, expect, it } from "vitest";

import { parseCaptionMetrics } from "@/features/library/caption-metrics";

describe("métriques et formatage des légendes", () => {
  it("extrait les likes et commentaires et conserve les paragraphes", () => {
    expect(parseCaptionMetrics(
      '5,646 likes, 27 comments - auteur le July 5, 2026: "Premier paragraphe\n\nSecond paragraphe".',
    )).toEqual({
      likes: 5_646,
      comments: 27,
      text: "Premier paragraphe\n\nSecond paragraphe",
    });
  });

  it("comprend les compteurs compacts", () => {
    expect(parseCaptionMetrics('19K likes, 1.2K comments - auteur: "Texte"')).toMatchObject({
      likes: 19_000,
      comments: 1_200,
      text: "Texte",
    });
  });

  it("préserve une légende sans préfixe social", () => {
    expect(parseCaptionMetrics("Ligne 1\r\nLigne 2")).toEqual({
      likes: null,
      comments: null,
      text: "Ligne 1\nLigne 2",
    });
  });
});
