import { describe, expect, it } from "vitest";

import {
  buildAuditMetadata,
  placeReviewContextSchema,
  REVIEW_REASON_MAX_LENGTH,
} from "@/lib/places/review-actor";

describe("placeReviewContextSchema", () => {
  const valid = { actor: { type: "USER" as const, id: "local-admin" }, reason: "manual fix" };

  it("accepts a bounded actor and reason", () => {
    expect(placeReviewContextSchema.parse(valid)).toEqual(valid);
  });

  it("rejects an empty or oversized reason", () => {
    expect(() => placeReviewContextSchema.parse({ ...valid, reason: "" })).toThrow();
    expect(() => placeReviewContextSchema.parse({ ...valid, reason: "x".repeat(REVIEW_REASON_MAX_LENGTH + 1) })).toThrow();
  });

  it("rejects an empty actor id or unknown actor type", () => {
    expect(() => placeReviewContextSchema.parse({ ...valid, actor: { type: "USER", id: "" } })).toThrow();
    expect(() => placeReviewContextSchema.parse({ ...valid, actor: { type: "GUEST", id: "x" } })).toThrow();
  });

  it("rejects unknown properties and arbitrary payloads", () => {
    expect(() => placeReviewContextSchema.parse({ ...valid, token: "secret" })).toThrow();
    expect(() => placeReviewContextSchema.parse({ ...valid, actor: { type: "USER", id: "x", session: "secret" } })).toThrow();
  });

  it("builds bounded audit metadata carrying only the action and actor identity", () => {
    expect(buildAuditMetadata("PLACE_CONFIRMED", { type: "MCP", id: "tool-1" })).toEqual({
      action: "PLACE_CONFIRMED",
      actorType: "MCP",
      actorId: "tool-1",
    });
  });
});
