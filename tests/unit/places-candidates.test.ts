import { describe, expect, it } from "vitest";

import { placeCandidateSchema, placeCandidateBatchSchema } from "@/lib/places/candidates";

const validCandidate = {
  name: "Nobu Dubai",
  city: "Dubai",
  region: null,
  country: "United Arab Emirates",
  category: "restaurant" as const,
  confidence: 0.9,
  evidence: [{ type: "CAPTION" as const, excerpt: "Dinner at Nobu Dubai" }],
};

describe("placeCandidateSchema", () => {
  it("accepts a bounded textual candidate", () => {
    expect(placeCandidateSchema.parse(validCandidate)).toEqual(validCandidate);
  });

  it("rejects model-supplied coordinates", () => {
    expect(() => placeCandidateSchema.parse({ ...validCandidate, latitude: 25.14 })).toThrow();
    expect(() => placeCandidateSchema.parse({ ...validCandidate, longitude: 55.18 })).toThrow();
  });

  it("rejects provider identifiers and precision", () => {
    expect(() => placeCandidateSchema.parse({ ...validCandidate, providerPlaceId: "forbidden" })).toThrow();
    expect(() => placeCandidateSchema.parse({ ...validCandidate, provider: "geoapify" })).toThrow();
    expect(() => placeCandidateSchema.parse({ ...validCandidate, precision: "EXACT" })).toThrow();
  });

  it("rejects an unknown category", () => {
    expect(() => placeCandidateSchema.parse({ ...validCandidate, category: "airport" })).toThrow();
  });

  it("rejects confidence outside [0, 1]", () => {
    expect(() => placeCandidateSchema.parse({ ...validCandidate, confidence: 1.5 })).toThrow();
    expect(() => placeCandidateSchema.parse({ ...validCandidate, confidence: -0.1 })).toThrow();
  });

  it("rejects an over-long excerpt", () => {
    expect(() =>
      placeCandidateSchema.parse({ ...validCandidate, evidence: [{ type: "CAPTION", excerpt: "x".repeat(501) }] }),
    ).toThrow();
  });

  it("rejects more than eight evidence rows", () => {
    const evidence = Array.from({ length: 9 }, () => ({ type: "CAPTION" as const, excerpt: "a" }));
    expect(() => placeCandidateSchema.parse({ ...validCandidate, evidence })).toThrow();
  });

  it("accepts an empty evidence list", () => {
    expect(placeCandidateSchema.parse({ ...validCandidate, evidence: [] })).toBeDefined();
  });
});

describe("placeCandidateBatchSchema", () => {
  it("accepts up to five candidates", () => {
    const items = Array.from({ length: 5 }, () => validCandidate);
    expect(placeCandidateBatchSchema.parse(items)).toHaveLength(5);
  });

  it("rejects more than five candidates", () => {
    const items = Array.from({ length: 6 }, () => validCandidate);
    expect(() => placeCandidateBatchSchema.parse(items)).toThrow();
  });
});
