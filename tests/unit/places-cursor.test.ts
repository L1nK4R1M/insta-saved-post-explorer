import { describe, expect, it } from "vitest";

import { decodePlacesCursor, encodePlacesCursor } from "@/lib/places/cursor";

describe("places cursor", () => {
  it("round-trips an opaque cursor", () => {
    const input = { updatedAt: new Date("2026-07-23T12:00:00.000Z"), id: "place-1" };
    expect(decodePlacesCursor(encodePlacesCursor(input))).toEqual(input);
  });

  it("produces a url-safe token without padding", () => {
    const token = encodePlacesCursor({ updatedAt: new Date("2026-07-23T12:00:00.000Z"), id: "place-1" });
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("rejects a malformed cursor", () => {
    expect(() => decodePlacesCursor("not-a-cursor")).toThrow();
  });

  it("rejects a cursor with a bad shape", () => {
    const bad = Buffer.from(JSON.stringify({ updatedAt: "nope", id: "" }), "utf8").toString("base64url");
    expect(() => decodePlacesCursor(bad)).toThrow();
  });

  const validToken = encodePlacesCursor({ updatedAt: new Date("2026-07-23T12:00:00.000Z"), id: "place-1" });

  it("rejects a valid token with an invalid suffix appended", () => {
    expect(() => decodePlacesCursor(`${validToken}!!!`)).toThrow();
  });

  it("rejects a valid token with base64 padding appended", () => {
    expect(() => decodePlacesCursor(`${validToken}=`)).toThrow();
  });

  it("rejects a token containing whitespace", () => {
    expect(() => decodePlacesCursor(`${validToken} `)).toThrow();
  });

  it("rejects a token containing a newline", () => {
    expect(() => decodePlacesCursor(`${validToken}\n`)).toThrow();
  });

  it("rejects an empty token", () => {
    expect(() => decodePlacesCursor("")).toThrow();
  });

  it("rejects an oversized token", () => {
    expect(() => decodePlacesCursor("A".repeat(2000))).toThrow();
  });

  it("rejects a non-canonical base64url token", () => {
    // The two-character group "AB" is not the canonical encoding of the byte it
    // decodes to; the canonical round-trip check must reject it.
    const decoded = Buffer.from("AB", "base64url");
    expect(decoded.toString("base64url")).not.toBe("AB");
    expect(() => decodePlacesCursor("AB")).toThrow();
  });

  it("rejects a canonical cursor carrying unknown properties", () => {
    const bad = Buffer.from(
      JSON.stringify({ updatedAt: "2026-07-23T12:00:00.000Z", id: "place-1", extra: 1 }),
      "utf8",
    ).toString("base64url");
    expect(() => decodePlacesCursor(bad)).toThrow();
  });
});
