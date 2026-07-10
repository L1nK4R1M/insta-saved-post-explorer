import { describe, expect, it } from "vitest";

import {
  isSafeInstagramPostUrl,
  isSafeRemoteUrl,
  normalizeImportPayload,
} from "@/lib/import/normalize";

describe("sécurité des URL importées", () => {
  it.each([
    "https://localhost/image.jpg",
    "https://api.local/image.jpg",
    "https://127.0.0.1/image.jpg",
    "https://2130706433/image.jpg",
    "https://169.254.169.254/latest/meta-data",
    "https://10.0.0.4/image.jpg",
    "https://172.16.0.1/image.jpg",
    "https://192.168.1.1/image.jpg",
    "https://[::1]/image.jpg",
    "https://[fe80::1]/image.jpg",
    "https://user:password@example.com/image.jpg",
    "http://example.com/image.jpg",
    "file:///etc/passwd",
  ])("refuse une URL média locale, privée ou non HTTPS: %s", (url) => {
    expect(isSafeRemoteUrl(url)).toBe(false);
  });

  it.each([
    "https://evilinstagram.com/p/ABC",
    "https://instagram.com.evil.example/p/ABC",
    "https://www.instagram.com/explore/ABC",
    "https://www.instagram.com/p/ABC/comment/1",
    "https://user:password@www.instagram.com/p/ABC",
    "javascript:alert(1)",
  ])("refuse une URL qui n'est pas une publication Instagram: %s", (url) => {
    expect(isSafeInstagramPostUrl(url)).toBe(false);
  });

  it("supprime fragments et paramètres des publications Instagram", () => {
    const result = normalizeImportPayload([{
      post_url: "https://WWW.INSTAGRAM.COM/reel/ABC123/?igsh=tracking#comments",
      thumbnail_url: "https://cdn.example.com/thumb.jpg?utm_source=tracking&size=large#fragment",
      username: "qa",
      caption: "test",
    }]);

    expect(result.items[0]?.postUrl).toBe("https://www.instagram.com/reel/ABC123");
    expect(result.items[0]?.thumbnailUrl).toBe("https://cdn.example.com/thumb.jpg?size=large");
  });

  it("exige HTTPS dès la validation de l'URL Instagram", () => {
    expect(isSafeInstagramPostUrl("http://www.instagram.com/p/ABC123")).toBe(false);
  });

  it("refuse les domaines média publics hors allowlist", () => {
    expect(isSafeRemoteUrl("https://tracker.example/collect.gif")).toBe(false);
  });
});
