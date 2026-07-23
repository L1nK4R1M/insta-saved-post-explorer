import "server-only";

import { MediaIdentity } from "@prisma/client";

import { prisma } from "@/server/db";

// Owner-scoped data access for the Places domain. Phase F1 only needs to load
// the bounded inputs used for job idempotency; Phase F2 extends this module
// with the atomic persistence transaction.

export type AnalysisPostInputs = {
  id: string;
  mainTheme: string | null;
  caption: string;
  authorUsername: string;
  internalTags: string[];
  structuredLocation: string | null;
  verifiedMedia: Array<{ objectKey: string; versionTag: string | null }>;
};

// Load a post strictly scoped to its owner with only the fields the metadata
// analysis needs. Never reads any collection. Returns null when the post does
// not exist for this owner.
export async function loadAnalysisPostInputs(
  ownerId: string,
  postId: string,
): Promise<AnalysisPostInputs | null> {
  const post = await prisma.post.findFirst({
    where: { id: postId, ownerId },
    select: {
      id: true,
      mainTheme: true,
      caption: true,
      authorUsername: true,
      metadata: true,
      postTags: { select: { tag: { select: { name: true } } } },
      media: {
        where: { identityState: MediaIdentity.VERIFIED, objectKey: { not: null } },
        select: { objectKey: true, versionTag: true },
        orderBy: { position: "asc" },
      },
    },
  });
  if (!post) return null;

  return {
    id: post.id,
    mainTheme: post.mainTheme,
    caption: post.caption,
    authorUsername: post.authorUsername,
    internalTags: post.postTags.map((link) => link.tag.name),
    structuredLocation: extractStructuredLocation(post.metadata),
    verifiedMedia: post.media.flatMap((media) =>
      media.objectKey ? [{ objectKey: media.objectKey, versionTag: media.versionTag }] : [],
    ),
  };
}

// Pull a bounded, already-present Instagram location string from post metadata
// if the export contained one. Never fabricates location data.
function extractStructuredLocation(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const value = (metadata as Record<string, unknown>).instagram_location;
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 500) : null;
}
