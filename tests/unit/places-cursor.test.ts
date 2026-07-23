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
});
