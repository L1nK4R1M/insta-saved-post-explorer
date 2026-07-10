import { describe, expect, it } from "vitest";

import {
  createImportBatches,
  extractEntries,
} from "@/features/library/components/import-dialog";

const encoder = new TextEncoder();

describe("extractEntries", () => {
  it("accepte le format tableau de l'import UI", () => {
    const entries = [{ post_url: "https://www.instagram.com/p/array" }];

    expect(extractEntries(entries)).toBe(entries);
  });

  it("accepte l'enveloppe items de l'export Instagram", () => {
    const entries = [{ post_url: "https://www.instagram.com/p/wrapped" }];

    expect(extractEntries({ schema_version: 1, count: 1, items: entries })).toBe(entries);
  });

  it("refuse les objets sans tableau items", () => {
    expect(() => extractEntries({ count: 0 })).toThrow(/tableau.*items/i);
    expect(() => extractEntries({ items: "invalide" })).toThrow(/tableau.*items/i);
  });
});

describe("createImportBatches", () => {
  it("borne chaque lot a 100 elements", () => {
    const entries = Array.from({ length: 205 }, (_, index) => ({ index }));

    const batches = createImportBatches(entries);

    expect(batches.map((batch) => batch.length)).toEqual([100, 100, 5]);
    expect(batches.flat()).toEqual(entries);
  });

  it("garde chaque corps JSON sous ou egal a 850 000 octets", () => {
    const entries = Array.from({ length: 5 }, (_, index) => ({
      index,
      caption: "e".repeat(300_000),
    }));

    const batches = createImportBatches(entries);

    expect(batches).toHaveLength(3);
    expect(batches.map((batch) => batch.length)).toEqual([2, 2, 1]);
    for (const batch of batches) {
      expect(jsonBytes(batch)).toBeLessThanOrEqual(850_000);
    }
    expect(batches.flat()).toEqual(entries);
  });

  it("mesure les octets UTF-8 et pas seulement le nombre de caracteres", () => {
    const entries = [
      { caption: "🍰".repeat(130_000) },
      { caption: "🍰".repeat(130_000) },
    ];

    const batches = createImportBatches(entries);

    expect(batches).toHaveLength(2);
    expect(batches.every((batch) => jsonBytes(batch) <= 850_000)).toBe(true);
  });

  it("refuse une publication qui depasse seule la limite d'un lot", () => {
    expect(() => createImportBatches([{ caption: "x".repeat(850_001) }])).toThrow(
      /publication.*taille maximale/i,
    );
  });
});

function jsonBytes(value: unknown): number {
  return encoder.encode(JSON.stringify(value)).byteLength;
}
