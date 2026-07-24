import "server-only";

import type { Place, PostPlace } from "@prisma/client";

import { resolveMergedPlaceReviewState } from "@/lib/places/merge-state";
import { prisma } from "@/server/db";

// Internal Places review and merge services for a future admin UI or scoped MCP
// command. They are never exposed through the read-only external API key. Every
// method requires an explicit ownerId, is owner-scoped, and treats a resource
// owned by someone else as absent. A user correction always dominates automatic
// re-analysis, which is enforced by the analysis service (F2).

const REASON_MAX_LENGTH = 500;

export type PlaceReviewErrorCode = "PLACE_NOT_FOUND" | "POST_PLACE_NOT_FOUND" | "INVALID_MERGE";

export class PlaceReviewError extends Error {
  readonly code: PlaceReviewErrorCode;
  constructor(code: PlaceReviewErrorCode) {
    super(code);
    this.code = code;
    this.name = "PlaceReviewError";
  }
}

// Confirm a canonical place: mark it CONFIRMED and user-confirmed so automatic
// analysis can no longer overwrite it.
export async function confirmPlace(ownerId: string, placeId: string): Promise<Place> {
  const updated = await prisma.place.updateMany({
    where: { id: placeId, ownerId },
    data: { reviewStatus: "CONFIRMED", isUserConfirmed: true },
  });
  if (updated.count === 0) throw new PlaceReviewError("PLACE_NOT_FOUND");
  return prisma.place.findUniqueOrThrow({ where: { id: placeId } });
}

// Reject a canonical place. It stays in the table (excluded from identified
// totals) but its links and evidence are not deleted.
export async function rejectPlaceResult(ownerId: string, placeId: string): Promise<Place> {
  const updated = await prisma.place.updateMany({
    where: { id: placeId, ownerId },
    data: { reviewStatus: "REJECTED" },
  });
  if (updated.count === 0) throw new PlaceReviewError("PLACE_NOT_FOUND");
  return prisma.place.findUniqueOrThrow({ where: { id: placeId } });
}

export type CorrectPostPlaceInput = {
  postId: string;
  placeId: string;
  isPrimary?: boolean;
  reason?: string;
};

// Manually correct a post-place link: mark it user-confirmed, optionally make it
// the single primary, and record a bounded USER_CORRECTION evidence row when a
// job exists for the post.
export async function correctPostPlace(ownerId: string, input: CorrectPostPlaceInput): Promise<PostPlace> {
  return prisma.$transaction(async (tx) => {
    const link = await tx.postPlace.findUnique({
      where: { ownerId_postId_placeId: { ownerId, postId: input.postId, placeId: input.placeId } },
    });
    if (!link) throw new PlaceReviewError("POST_PLACE_NOT_FOUND");

    if (input.isPrimary === true) {
      await tx.postPlace.updateMany({
        where: { ownerId, postId: input.postId, isPrimary: true, id: { not: link.id } },
        data: { isPrimary: false },
      });
    }

    const updated = await tx.postPlace.update({
      where: { id: link.id },
      data: { isUserConfirmed: true, ...(input.isPrimary != null ? { isPrimary: input.isPrimary } : {}) },
    });

    const jobId =
      link.analysisJobId ??
      (
        await tx.placeAnalysisJob.findFirst({
          where: { ownerId, postId: input.postId },
          orderBy: { createdAt: "desc" },
          select: { id: true },
        })
      )?.id;
    if (jobId) {
      await tx.placeEvidence.create({
        data: {
          ownerId,
          postId: input.postId,
          placeId: input.placeId,
          analysisJobId: jobId,
          evidenceType: "USER_CORRECTION",
          excerpt: input.reason?.slice(0, REASON_MAX_LENGTH) ?? null,
          confidence: 1,
        },
      });
    }

    return updated;
  });
}

export type MergePlacesInput = {
  sourcePlaceId: string;
  targetPlaceId: string;
};

// Merge the source canonical place into the target within one transaction:
// move or deduplicate links, move evidence, preserve user corrections, keep a
// single primary per post, delete the source, and roll back on any failure.
export async function mergePlaces(ownerId: string, input: MergePlacesInput): Promise<Place> {
  if (input.sourcePlaceId === input.targetPlaceId) throw new PlaceReviewError("INVALID_MERGE");

  return prisma.$transaction(async (tx) => {
    const source = await tx.place.findUnique({ where: { id: input.sourcePlaceId } });
    const target = await tx.place.findUnique({ where: { id: input.targetPlaceId } });
    if (!source || source.ownerId !== ownerId) throw new PlaceReviewError("PLACE_NOT_FOUND");
    if (!target || target.ownerId !== ownerId) throw new PlaceReviewError("PLACE_NOT_FOUND");

    const sourceLinks = await tx.postPlace.findMany({ where: { ownerId, placeId: input.sourcePlaceId } });
    const affectedPostIds = new Set<string>();

    for (const link of sourceLinks) {
      affectedPostIds.add(link.postId);
      const existing = await tx.postPlace.findUnique({
        where: { ownerId_postId_placeId: { ownerId, postId: link.postId, placeId: input.targetPlaceId } },
      });
      if (existing) {
        // Deduplicate: keep the target link, preserving a user correction.
        if (link.isUserConfirmed && !existing.isUserConfirmed) {
          await tx.postPlace.update({ where: { id: existing.id }, data: { isUserConfirmed: true } });
        }
        await tx.postPlace.delete({ where: { id: link.id } });
      } else {
        // Move the link; primaries are normalized below to avoid two per post.
        await tx.postPlace.update({ where: { id: link.id }, data: { placeId: input.targetPlaceId, isPrimary: false } });
      }
    }

    // Re-point evidence from the source place to the target.
    await tx.placeEvidence.updateMany({
      where: { ownerId, placeId: input.sourcePlaceId },
      data: { placeId: input.targetPlaceId },
    });

    // Preserve the user's durable review decision from either side before the
    // source row is removed, using the deterministic merge policy. This runs in
    // the same transaction as the source deletion, so a failure rolls both back.
    // Preserve the user's durable review decision from either side before the
    // source row is removed, using the deterministic merge policy. This runs in
    // the same transaction as the source deletion, so a failure rolls both back.
    const merged = resolveMergedPlaceReviewState(source, target);
    await tx.place.update({
      where: { id: input.targetPlaceId },
      data: { reviewStatus: merged.reviewStatus, isUserConfirmed: merged.isUserConfirmed },
    });

    await tx.place.delete({ where: { id: input.sourcePlaceId } });

    // Ensure exactly one primary per affected post, preferring a user-confirmed
    // link then the highest confidence.
    for (const postId of affectedPostIds) {
      const links = await tx.postPlace.findMany({
        where: { ownerId, postId },
        orderBy: [{ isUserConfirmed: "desc" }, { confidence: "desc" }, { placeId: "asc" }],
        select: { id: true },
      });
      if (links.length === 0) continue;
      await tx.postPlace.updateMany({ where: { ownerId, postId, isPrimary: true }, data: { isPrimary: false } });
      await tx.postPlace.update({ where: { id: links[0].id }, data: { isPrimary: true } });
    }

    return tx.place.findUniqueOrThrow({ where: { id: input.targetPlaceId } });
  }, { timeout: 15_000 });
}
