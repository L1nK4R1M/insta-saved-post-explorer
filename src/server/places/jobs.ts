import "server-only";

import { Prisma, type PlaceAnalysisJob } from "@prisma/client";

import { canonicalPlacesTheme } from "@/lib/places/eligibility";
import { prisma } from "@/server/db";
import { computePlacesInputHash } from "@/server/places/hash";
import { loadAnalysisPostInputs } from "@/server/places/repository";

// Default analysis version. A caption-content change or a version bump yields a
// new idempotent job; the same content and version returns the existing job.
export const PLACES_ANALYSIS_VERSION = process.env.PLACES_ANALYSIS_VERSION?.trim() || "places-v1";

export type PlacesJobErrorCode = "POST_NOT_FOUND" | "POST_NOT_PLACES_ELIGIBLE" | "PLACES_INPUT_STALE";

export class PlacesJobError extends Error {
  readonly code: PlacesJobErrorCode;
  constructor(code: PlacesJobErrorCode) {
    super(code);
    this.code = code;
    this.name = "PlacesJobError";
  }
}

export type CreateMetadataAnalysisJobInput = {
  ownerId: string;
  postId: string;
  analysisVersion?: string;
};

// Create (or return the existing idempotent) METADATA_ONLY analysis job for an
// eligible post. Eligibility is decided only by isPlacesEligibleTheme through
// canonicalPlacesTheme; collections are never consulted. Owner-scoped end to end.
export async function createMetadataAnalysisJob(
  input: CreateMetadataAnalysisJobInput,
): Promise<PlaceAnalysisJob> {
  const analysisVersion = input.analysisVersion?.trim() || PLACES_ANALYSIS_VERSION;

  const post = await loadAnalysisPostInputs(input.ownerId, input.postId);
  if (!post) throw new PlacesJobError("POST_NOT_FOUND");

  const sourceTheme = canonicalPlacesTheme(post.mainTheme);
  if (!sourceTheme) throw new PlacesJobError("POST_NOT_PLACES_ELIGIBLE");

  const inputHash = computePlacesInputHash({
    analysisVersion,
    postId: post.id,
    sourceTheme,
    caption: post.caption,
    authorUsername: post.authorUsername,
    internalTags: post.internalTags,
    structuredLocation: post.structuredLocation,
    verifiedMedia: post.verifiedMedia,
  });

  const identity = {
    ownerId: input.ownerId,
    postId: post.id,
    inputHash,
    analysisVersion,
  };

  // Concurrency-safe idempotency. Prisma's upsert with an empty `update` cannot
  // use the database-native path, so two concurrent first calls can both read
  // "missing" and one then fails with P2002. Instead we attempt the insert and,
  // only when the idempotency unique constraint conflicts, re-read the existing
  // row. A P2002 from any other constraint (or a conflict with no matching row)
  // is rethrown untouched.
  try {
    return await prisma.placeAnalysisJob.create({
      data: { ...identity, sourceTheme, depth: "METADATA_ONLY" },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await prisma.placeAnalysisJob.findUnique({
        where: { ownerId_postId_inputHash_analysisVersion: identity },
      });
      if (existing) return existing;
    }
    throw error;
  }
}
