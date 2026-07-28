import { describe, expect, it } from "vitest";

import { decodePlacesCursor, encodePlacesCursor } from "@/lib/places/cursor";

// The cursor is an opaque public contract: it crosses the API boundary, so a
// caller must not be able to forge or mutate one. The risk is a permissive
// decoder, and it is covered by one rejection table rather than one test per
// malformed input — every input below is still exercised.

const REFERENCE = { updatedAt: new Date("2026-07-23T12:00:00.000Z"), id: "place-1" };
const VALID = encodePlacesCursor(REFERENCE);

function encodeJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

describe("places cursor", () => {
  it("round-trips and stays url-safe", () => {
    expect(decodePlacesCursor(VALID)).toEqual(REFERENCE);
    expect(VALID).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("rejects every malformed, padded, altered or oversized token", () => {
    const rejected: [string, string][] = [
      ["not base64url at all", "not-a-cursor"],
      ["empty", ""],
      ["invalid suffix appended", `${VALID}!!!`],
      ["base64 padding appended", `${VALID}=`],
      ["trailing whitespace", `${VALID} `],
      ["trailing newline", `${VALID}\n`],
      ["oversized", "A".repeat(2000)],
      // "AB" is not the canonical encoding of the byte it decodes to; the
      // canonical round-trip check must reject it.
      ["non-canonical base64url", "AB"],
    ];
    for (const [label, token] of rejected) {
      expect(() => decodePlacesCursor(token), label).toThrow();
    }
    // A non-canonical token really is non-canonical — guards the case above
    // against silently becoming vacuous if the encoding changes.
    expect(Buffer.from("AB", "base64url").toString("base64url")).not.toBe("AB");
  });

  it("rejects a well-formed token whose payload is wrong", () => {
    const payloads: [string, unknown][] = [
      ["bad field types", { updatedAt: "nope", id: "" }],
      ["unknown properties", { updatedAt: "2026-07-23T12:00:00.000Z", id: "place-1", extra: 1 }],
    ];
    for (const [label, payload] of payloads) {
      expect(() => decodePlacesCursor(encodeJson(payload)), label).toThrow();
    }
  });
});
