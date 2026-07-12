import { describe, expect, it } from "vitest";

import { parseCaptionMetrics } from "@/features/library/caption-metrics";

describe("métriques et formatage des légendes", () => {
  it("extrait les likes et commentaires et conserve les paragraphes", () => {
    expect(parseCaptionMetrics(
      '5,646 likes, 27 comments - auteur le July 5, 2026: "Premier paragraphe\n\nSecond paragraphe".',
    )).toEqual({
      likes: 5_646,
      comments: 27,
      publishedAt: new Date("2026-07-05T12:00:00.000Z"),
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
      publishedAt: null,
      text: "Ligne 1\nLigne 2",
    });
  });

  it("récupère la date des anciennes captions enrichies", () => {
    expect(parseCaptionMetrics(
      '535 likes, 10 comments - birdinadeficit le  July 3, 2026: "Tiramisu".',
    ).publishedAt).toEqual(new Date("2026-07-03T12:00:00.000Z"));
    expect(parseCaptionMetrics("Caption sans date").publishedAt).toBeNull();
  });
});
