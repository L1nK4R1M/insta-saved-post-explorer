import "server-only";

import type { PlaceAnalysisJob } from "@prisma/client";

import { canonicalPlacesTheme } from "@/lib/places/eligibility";
import { prisma } from "@/server/db";
import { computePlacesInputHash } from "@/server/places/hash";
import { loadAnalysisPostInputs } from "@/server/places/repository";

// Default analysis version. A caption-content change or a version bump yields a
// new idempotent job; the same content and version returns the existing job.
export const PLACES_ANALYSIS_VERSION = process.env.PLACES_ANALYSIS_VERSION?.trim() || "places-v1";

export class PlacesJobError extends Error {
  readonly code: "POST_NOT_FOUND" | "POST_NOT_PLACES_ELIGIBLE";
  constructor(code: "POST_NOT_FOUND" | "POST_NOT_PLACES_ELIGIBLE") {
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

  return prisma.placeAnalysisJob.upsert({
    where: {
      ownerId_postId_inputHash_analysisVersion: {
        ownerId: input.ownerId,
        postId: post.id,
        inputHash,
        analysisVersion,
      },
    },
    // An existing job is returned untouched: creation is idempotent.
    update: {},
    create: {
      ownerId: input.ownerId,
      postId: post.id,
      sourceTheme,
      analysisVersion,
      inputHash,
      depth: "METADATA_ONLY",
    },
  });
}
