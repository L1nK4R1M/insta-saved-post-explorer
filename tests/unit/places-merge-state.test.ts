import { describe, expect, it } from "vitest";

import {
  PLACE_REVIEW_STATUS_VALUES,
  resolveMergedPlaceReviewState,
  type PlaceReviewStatusValue,
} from "@/lib/places/merge-state";

function state(reviewStatus: PlaceReviewStatusValue, isUserConfirmed: boolean) {
  return { reviewStatus, isUserConfirmed };
}

describe("resolveMergedPlaceReviewState", () => {
  it.each<[PlaceReviewStatusValue, PlaceReviewStatusValue, PlaceReviewStatusValue]>([
    ["UNREVIEWED", "UNREVIEWED", "UNREVIEWED"],
    ["UNREVIEWED", "CONFIRMED", "CONFIRMED"],
    ["UNREVIEWED", "REJECTED", "REJECTED"],
    ["UNREVIEWED", "CONFLICT", "CONFLICT"],
    ["CONFIRMED", "CONFIRMED", "CONFIRMED"],
    ["CONFIRMED", "REJECTED", "CONFLICT"],
    ["CONFIRMED", "CONFLICT", "CONFLICT"],
    ["REJECTED", "REJECTED", "REJECTED"],
    ["REJECTED", "CONFLICT", "CONFLICT"],
    ["CONFLICT", "CONFLICT", "CONFLICT"],
  ])("resolves %s + %s to %s", (a, b, expected) => {
    expect(resolveMergedPlaceReviewState(state(a, false), state(b, false)).reviewStatus).toBe(expected);
  });

  it("keeps isUserConfirmed true when either side is confirmed", () => {
    expect(resolveMergedPlaceReviewState(state("CONFIRMED", true), state("UNREVIEWED", false)).isUserConfirmed).toBe(true);
    expect(resolveMergedPlaceReviewState(state("UNREVIEWED", false), state("UNREVIEWED", true)).isUserConfirmed).toBe(true);
    expect(resolveMergedPlaceReviewState(state("UNREVIEWED", false), state("UNREVIEWED", false)).isUserConfirmed).toBe(false);
  });

  it("never silently downgrades a confirmation to UNREVIEWED", () => {
    for (const other of PLACE_REVIEW_STATUS_VALUES) {
      const result = resolveMergedPlaceReviewState(state("CONFIRMED", true), state(other, false));
      expect(result.reviewStatus).not.toBe("UNREVIEWED");
    }
  });

  it("turns a confirmation-versus-rejection contradiction into CONFLICT with the confirmation kept", () => {
    const result = resolveMergedPlaceReviewState(state("CONFIRMED", true), state("REJECTED", false));
    expect(result).toEqual({ reviewStatus: "CONFLICT", isUserConfirmed: true });
  });

  it("never downgrades an existing CONFLICT", () => {
    for (const other of PLACE_REVIEW_STATUS_VALUES) {
      expect(resolveMergedPlaceReviewState(state("CONFLICT", false), state(other, false)).reviewStatus).toBe("CONFLICT");
    }
  });

  it("is commutative for the review status across the full matrix", () => {
    for (const a of PLACE_REVIEW_STATUS_VALUES) {
      for (const b of PLACE_REVIEW_STATUS_VALUES) {
        const forward = resolveMergedPlaceReviewState(state(a, false), state(b, true));
        const backward = resolveMergedPlaceReviewState(state(b, true), state(a, false));
        expect(forward.reviewStatus).toBe(backward.reviewStatus);
        expect(forward.isUserConfirmed).toBe(backward.isUserConfirmed);
      }
    }
  });
});
