// Deterministic review-state resolution for a place merge. Pure and
// order-independent (commutative for the review status), so merging two
// canonical places never silently loses an explicit user decision carried by
// either the source or the target.
//
// Policy:
// - isUserConfirmed is preserved from either side: true when either place was
//   confirmed or corrected by the user (a logical OR).
// - Equal statuses keep that status.
// - CONFLICT dominates every automatic or ambiguous state and is never
//   downgraded.
// - A confirmation versus a rejection is a genuine contradiction, so it becomes
//   CONFLICT (the user confirmation is still kept via isUserConfirmed).
// - CONFIRMED dominates UNREVIEWED.
// - REJECTED dominates UNREVIEWED only when no confirmation is involved.
//
// The value type mirrors the Prisma `PlaceReviewStatus` enum literals, so Place
// rows can be passed directly.

export const PLACE_REVIEW_STATUS_VALUES = ["UNREVIEWED", "CONFIRMED", "REJECTED", "CONFLICT"] as const;

export type PlaceReviewStatusValue = (typeof PLACE_REVIEW_STATUS_VALUES)[number];

export type PlaceReviewState = {
  reviewStatus: PlaceReviewStatusValue;
  isUserConfirmed: boolean;
};

function mergeReviewStatus(a: PlaceReviewStatusValue, b: PlaceReviewStatusValue): PlaceReviewStatusValue {
  if (a === b) return a;
  const pair = new Set<PlaceReviewStatusValue>([a, b]);
  if (pair.has("CONFLICT")) return "CONFLICT";
  if (pair.has("CONFIRMED") && pair.has("REJECTED")) return "CONFLICT";
  if (pair.has("CONFIRMED")) return "CONFIRMED";
  if (pair.has("REJECTED")) return "REJECTED";
  return "UNREVIEWED";
}

export function resolveMergedPlaceReviewState(
  source: PlaceReviewState,
  target: PlaceReviewState,
): PlaceReviewState {
  return {
    reviewStatus: mergeReviewStatus(source.reviewStatus, target.reviewStatus),
    isUserConfirmed: source.isUserConfirmed || target.isUserConfirmed,
  };
}
