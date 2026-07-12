import { afterEach, describe, expect, it } from "vitest";

import { parsePublicMediaBaseUrl, resolvePublicMediaUrl } from "@/lib/media-url";

const originalBaseUrl = process.env.MEDIA_PUBLIC_BASE_URL;
const originalPrefix = process.env.MEDIA_PATH_PREFIX;

afterEach(() => {
  process.env.MEDIA_PUBLIC_BASE_URL = originalBaseUrl;
  process.env.MEDIA_PATH_PREFIX = originalPrefix;
});

describe("resolvePublicMediaUrl", () => {
  it("construit une URL R2 publique depuis le chemin source", () => {
    process.env.MEDIA_PUBLIC_BASE_URL = "https://media.example.com";
    process.env.MEDIA_PATH_PREFIX = "originals";

    expect(resolvePublicMediaUrl("créateur/CODE/media-02.jpg", "https://fallback.test/a.jpg", {
      type: "image",
      position: 1,
      mediaCount: 3,
    })).toBe("https://media.example.com/originals/cr%C3%A9ateur/CODE_2.jpg");
  });

  it("résout séparément une vidéo et son affiche", () => {
    process.env.MEDIA_PUBLIC_BASE_URL = "https://media.example.com";
    process.env.MEDIA_PATH_PREFIX = "originals";
    const sourcePath = "1030micchan/DSPVgoCk7Zg/media-01.mp4";

    expect(resolvePublicMediaUrl(sourcePath, null, { type: "video", position: 0, mediaCount: 1 }))
      .toBe("https://media.example.com/originals/1030micchan/DSPVgoCk7Zg.mp4");
    expect(resolvePublicMediaUrl(sourcePath, null, {
      type: "video",
      position: 0,
      mediaCount: 1,
      thumbnail: true,
    })).toBe("https://media.example.com/originals/1030micchan/DSPVgoCk7Zg.jpg");
  });

  it("conserve une clé R2 canonique déjà transformée", () => {
    process.env.MEDIA_PUBLIC_BASE_URL = "https://media.example.com";
    process.env.MEDIA_PATH_PREFIX = "originals";

    expect(resolvePublicMediaUrl("auteur/CODE_2.jpg", null, {
      type: "image",
      position: 1,
      mediaCount: 3,
    })).toBe("https://media.example.com/originals/auteur/CODE_2.jpg");
  });

  it("conserve le secours lorsque le domaine public n'est pas configuré", () => {
    delete process.env.MEDIA_PUBLIC_BASE_URL;
    expect(resolvePublicMediaUrl("auteur/CODE/media.jpg", "https://fallback.test/a.jpg"))
      .toBe("https://fallback.test/a.jpg");
  });

  it("refuse un endpoint non HTTPS ou credentialisé", () => {
    expect(parsePublicMediaBaseUrl("http://media.example.com")).toBeNull();
    expect(parsePublicMediaBaseUrl("https://user:secret@media.example.com")).toBeNull();
  });
});
