// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createHash } from "node:crypto";

import {
  ExternalApiUnauthorizedError,
  ExternalApiUnavailableError,
  requireExternalApiKey,
} from "@/auth/api-key";

const TOKEN = "ipe_secret-token-value";
const HASH = createHash("sha256").update(TOKEN).digest("hex");
const previousHash = process.env.EXTERNAL_API_KEY_SHA256;

function request(authorization?: string): Request {
  return new Request(
    "http://localhost/api/v1/posts",
    authorization ? { headers: { authorization } } : undefined,
  );
}

describe("requireExternalApiKey", () => {
  afterEach(() => {
    process.env.EXTERNAL_API_KEY_SHA256 = previousHash;
  });

  it("accepts a valid Bearer token", () => {
    process.env.EXTERNAL_API_KEY_SHA256 = HASH;
    expect(() => requireExternalApiKey(request(`Bearer ${TOKEN}`))).not.toThrow();
  });

  it("accepts a case-insensitive scheme and surrounding whitespace", () => {
    process.env.EXTERNAL_API_KEY_SHA256 = HASH.toUpperCase();
    expect(() => requireExternalApiKey(request(`bearer   ${TOKEN}`))).not.toThrow();
  });

  it("rejects a missing header", () => {
    process.env.EXTERNAL_API_KEY_SHA256 = HASH;
    expect(() => requireExternalApiKey(request())).toThrow(ExternalApiUnauthorizedError);
  });

  it("rejects a non-Bearer scheme", () => {
    process.env.EXTERNAL_API_KEY_SHA256 = HASH;
    expect(() => requireExternalApiKey(request(`Basic ${TOKEN}`))).toThrow(ExternalApiUnauthorizedError);
  });

  it("rejects a wrong token", () => {
    process.env.EXTERNAL_API_KEY_SHA256 = HASH;
    expect(() => requireExternalApiKey(request("Bearer ipe_wrong-token"))).toThrow(ExternalApiUnauthorizedError);
  });

  it("fails closed when the hash is absent", () => {
    delete process.env.EXTERNAL_API_KEY_SHA256;
    expect(() => requireExternalApiKey(request(`Bearer ${TOKEN}`))).toThrow(ExternalApiUnavailableError);
  });

  it("fails closed when the hash is malformed", () => {
    process.env.EXTERNAL_API_KEY_SHA256 = "not-a-valid-hex-hash";
    expect(() => requireExternalApiKey(request(`Bearer ${TOKEN}`))).toThrow(ExternalApiUnavailableError);
  });

  it("never leaks the provided token in the error", () => {
    process.env.EXTERNAL_API_KEY_SHA256 = HASH;
    try {
      requireExternalApiKey(request("Bearer ipe_super-secret-leak-check"));
      throw new Error("should have thrown");
    } catch (error) {
      expect(String((error as Error).message)).not.toContain("super-secret-leak-check");
    }
  });
});
