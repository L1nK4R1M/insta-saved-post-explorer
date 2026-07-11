import { describe, expect, it } from "vitest";

import {
  isSafeRemoteUrl,
  normalizeImportPayload,
  prepareImportPayload,
  tagSlug,
} from "@/lib/import/normalize";

const validItem = {
  thumbnail_url: "https://cdn.example.com/thumb.jpg?utm_source=test",
  username: " créateur ",
  post_url: "https://www.instagram.com/p/ABC123/?igsh=test#fragment",
  caption: "  Délicieux gâteau  ",
  main_theme: "Sucré",
  tags: ["Pâtisserie", " pâtisserie ", "Dessert"],
};

describe("normalizeImportPayload", () => {
  it("corrige la faute historique du thème Cuisine", () => {
    const result = normalizeImportPayload([{
      post_url: "https://www.instagram.com/p/cuisine-theme",
      thumbnail_url: "https://cdn.example.com/cuisine.jpg",
      username: "chef",
      main_theme: "Cusine",
    }]);

    expect(result.items[0].mainTheme).toBe("Cuisine");
  });
  it("accepte un tableau ou un wrapper items et normalise les alias", () => {
    const direct = normalizeImportPayload([validItem]);
    const wrapped = normalizeImportPayload({ items: [validItem], count: 1 });

    expect(direct.items).toHaveLength(1);
    expect(wrapped.items[0]).toEqual(direct.items[0]);
    expect(direct.items[0]).toMatchObject({
      postUrl: "https://www.instagram.com/p/ABC123",
      authorUsername: "créateur",
      caption: "Délicieux gâteau",
      mainTheme: "Sucré",
      tags: ["Pâtisserie", "Dessert"],
    });
  });

  it("garde main_theme distinct des tags", () => {
    const result = normalizeImportPayload([validItem]).items[0];
    expect(result.mainTheme).toBe("Sucré");
    expect(result.tags).not.toContain("Sucré");
  });

  it("signale les entrées invalides sans rejeter les entrées valides", () => {
    const result = normalizeImportPayload([
      validItem,
      { ...validItem, post_url: "javascript:alert(1)" },
      { ...validItem, thumbnail_url: "http://127.0.0.1/private" },
    ]);

    expect(result.items).toHaveLength(1);
    expect(result.invalid).toBe(2);
    expect(result.issues.map((issue) => issue.index)).toEqual([1, 2]);
  });

  it("déduplique les postUrl canoniques en conservant la dernière entrée", () => {
    const result = prepareImportPayload([
      validItem,
      { ...validItem, post_url: "https://www.instagram.com/p/ABC123?utm=duplicate", caption: "mise à jour" },
    ]);

    expect(result.items).toHaveLength(1);
    expect(result.skipped).toBe(1);
    expect(result.items[0].caption).toBe("mise à jour");
  });

  it("borne profondeur et taille des metadata", () => {
    const metadata: Record<string, unknown> = {};
    let cursor = metadata;
    for (let depth = 0; depth < 10; depth += 1) {
      const child: Record<string, unknown> = {};
      cursor.child = child;
      cursor = child;
    }

    const result = normalizeImportPayload([{ ...validItem, metadata }]);
    expect(result.invalid).toBe(1);
    expect(result.issues[0].fields).toContain("metadata");
  });
});

describe("URL et tags", () => {
  it("refuse les URL locales, privées, credentialisées et non HTTP", () => {
    expect(isSafeRemoteUrl("https://example.com/image.jpg")).toBe(true);
    expect(isSafeRemoteUrl("http://localhost:3000/private")).toBe(false);
    expect(isSafeRemoteUrl("http://192.168.1.4/private")).toBe(false);
    expect(isSafeRemoteUrl("https://user:secret@example.com/private")).toBe(false);
    expect(isSafeRemoteUrl("file:///etc/passwd")).toBe(false);
  });

  it("normalise casse et accents pour l'unicité des tags", () => {
    expect(tagSlug("  Pâtisserie Française ")).toBe("patisserie-francaise");
  });
});
