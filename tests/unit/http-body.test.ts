import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  MAX_IMPORT_BODY_BYTES,
  readBoundedJsonBody,
  RequestBodyTooLargeError,
  UnsupportedMediaTypeError,
} from "@/server/http";

describe("readBoundedJsonBody", () => {
  it("garde une marge stricte sous la limite Vercel", () => {
    expect(MAX_IMPORT_BODY_BYTES).toBe(1_000_000);
  });

  it("lit un corps JSON valide", async () => {
    const request = new Request("https://example.com/api/import", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ items: [] }),
    });

    await expect(readBoundedJsonBody(request, 1_024)).resolves.toEqual({ items: [] });
  });

  it("refuse le mauvais type de média", async () => {
    const request = new Request("https://example.com/api/import", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: "[]",
    });

    await expect(readBoundedJsonBody(request, 1_024)).rejects.toBeInstanceOf(
      UnsupportedMediaTypeError,
    );
  });

  it("refuse un Content-Length supérieur à la limite", async () => {
    const request = new Request("https://example.com/api/import", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": "2048" },
      body: "[]",
    });

    await expect(readBoundedJsonBody(request, 1_024)).rejects.toBeInstanceOf(
      RequestBodyTooLargeError,
    );
  });

  it("borne aussi le flux lorsque Content-Length est absent ou mensonger", async () => {
    const request = new Request("https://example.com/api/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: "x".repeat(2_000) }),
    });

    await expect(readBoundedJsonBody(request, 1_024)).rejects.toBeInstanceOf(
      RequestBodyTooLargeError,
    );
  });
});
