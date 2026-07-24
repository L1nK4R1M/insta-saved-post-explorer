import "server-only";

import type { Place, Prisma, PostPlace } from "@prisma/client";

import { resolveMergedPlaceReviewState } from "@/lib/places/merge-state";
import {
  buildAuditMetadata,
  placeReviewContextSchema,
  type PlaceReviewAction,
  type PlaceReviewContext,
} from "@/lib/places/review-actor";
import { prisma } from "@/server/db";

// Internal Places review and merge services for a future admin UI or scoped MCP
// command. They are never exposed through the read-only external API key. Every
// method requires an explicit ownerId and a validated actor+reason context, is
// owner-scoped, and treats a resource owned by someone else as absent. Every
// human action is auditable: it persists a bounded USER_CORRECTION evidence row
// (action + actor, reason in the excerpt) in the same transaction as the
// mutation. Auditing is all-or-nothing: an action fails before any mutation
// unless every affected post resolves to a job that can carry its proof, so a
// review can never leave a partial or empty audit trail. A user correction
// dominates automatic re-analysis (enforced by the analysis service, F2).

type TxClient = Prisma.TransactionClient;
type AuditTarget = { postId: string; jobId: string };

export type PlaceReviewErrorCode =
  | "PLACE_NOT_FOUND"
  | "POST_PLACE_NOT_FOUND"
  | "INVALID_MERGE"
  | "INVALID_REVIEW_CONTEXT"
  | "PLACE_REVIEW_AUDIT_CONTEXT_MISSING";

export class PlaceReviewError extends Error {
  readonly code: PlaceReviewErrorCode;
  constructor(code: PlaceReviewErrorCode) {
    // The message is the stable code only: an actor id or reason is never leaked.
    super(code);
    this.code = code;
    this.name = "PlaceReviewError";
  }
}

// Validate the actor/reason context, converting any schema failure into a stable
// code so no actor id or reason ever appears in a thrown error.
function validateContext(context: unknown): PlaceReviewContext {
  const parsed = placeReviewContextSchema.safeParse(context);
  if (!parsed.success) throw new PlaceReviewError("INVALID_REVIEW_CONTEXT");
  return parsed.data;
}

async function latestJobId(tx: TxClient, ownerId: string, postId: string): Promise<string | null> {
  const job = await tx.placeAnalysisJob.findFirst({
    where: { ownerId, postId },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  return job?.id ?? null;
}

// Resolve exactly one auditable (post, job) target per DISTINCT affected post.
// For each post it prefers a job already carried by one of its links, then the
// latest owner-scoped job for that post. It is all-or-nothing: if any distinct
// post cannot be resolved to a job, it throws PLACE_REVIEW_AUDIT_CONTEXT_MISSING
// before the caller performs any mutation, so a review action can never persist a
// partial audit trail. Targets are deduplicated per post (owner is fixed), so the
// count of targets equals the number of distinct affected posts. An empty input
// yields an empty result; callers that require at least one proof refuse it. The
// error never carries a post id: only a count of unresolved posts is tracked.
async function requireAuditTargetsForPosts(
  tx: TxClient,
  ownerId: string,
  posts: ReadonlyArray<{ postId: string; analysisJobId: string | null }>,
): Promise<AuditTarget[]> {
  // Collapse links to distinct posts, remembering the first job a link already
  // carries for each post (a link job is preferred over the latest job).
  const orderedPostIds: string[] = [];
  const seen = new Set<string>();
  const linkJobByPost = new Map<string, string>();
  for (const { postId, analysisJobId } of posts) {
    if (!seen.has(postId)) {
      seen.add(postId);
      orderedPostIds.push(postId);
    }
    if (analysisJobId && !linkJobByPost.has(postId)) linkJobByPost.set(postId, analysisJobId);
  }

  const targets: AuditTarget[] = [];
  let unresolvedCount = 0;
  for (const postId of orderedPostIds) {
    const jobId = linkJobByPost.get(postId) ?? (await latestJobId(tx, ownerId, postId));
    if (!jobId) {
      unresolvedCount += 1;
      continue;
    }
    targets.push({ postId, jobId });
  }
  if (unresolvedCount > 0) throw new PlaceReviewError("PLACE_REVIEW_AUDIT_CONTEXT_MISSING");
  return targets;
}

// Convenience wrapper: resolve complete audit targets from every link of a place.
async function requireAuditTargetsForPlace(tx: TxClient, ownerId: string, placeId: string): Promise<AuditTarget[]> {
  const links = await tx.postPlace.findMany({
    where: { ownerId, placeId },
    select: { postId: true, analysisJobId: true },
  });
  return requireAuditTargetsForPosts(tx, ownerId, links);
}

async function writeAuditEvidence(
  tx: TxClient,
  ownerId: string,
  placeId: string,
  targets: AuditTarget[],
  action: PlaceReviewAction,
  context: PlaceReviewContext,
): Promise<void> {
  if (targets.length === 0) return;
  const metadata = buildAuditMetadata(action, context.actor);
  await tx.placeEvidence.createMany({
    data: targets.map((target) => ({
      ownerId,
      postId: target.postId,
      placeId,
      analysisJobId: target.jobId,
      evidenceType: "USER_CORRECTION" as const,
      excerpt: context.reason,
      confidence: 1,
      metadata,
    })),
  });
}

// Confirm a canonical place: mark it CONFIRMED and user-confirmed so automatic
// analysis can no longer overwrite it, with an audit trail.
export async function confirmPlace(ownerId: string, placeId: string, context: unknown): Promise<Place> {
  const reviewContext = validateContext(context);
  return prisma.$transaction(async (tx) => {
    const place = await tx.place.findFirst({ where: { id: placeId, ownerId }, select: { id: true } });
    if (!place) throw new PlaceReviewError("PLACE_NOT_FOUND");

    // Every linked post must resolve to a job before mutating; a place with no
    // links has nothing to audit and is refused too.
    const targets = await requireAuditTargetsForPlace(tx, ownerId, placeId);
    if (targets.length === 0) throw new PlaceReviewError("PLACE_REVIEW_AUDIT_CONTEXT_MISSING");

    await tx.place.update({ where: { id: placeId }, data: { reviewStatus: "CONFIRMED", isUserConfirmed: true } });
    await writeAuditEvidence(tx, ownerId, placeId, targets, "PLACE_CONFIRMED", reviewContext);
    return tx.place.findUniqueOrThrow({ where: { id: placeId } });
  });
}

// Reject a canonical place. The rejection is durable: isUserConfirmed is set so
// automatic re-analysis cannot treat it as an unconfirmed automatic result. The
// place stays in the table (excluded from identified totals); its links and
// evidence are not deleted.
export async function rejectPlaceResult(ownerId: string, placeId: string, context: unknown): Promise<Place> {
  const reviewContext = validateContext(context);
  return prisma.$transaction(async (tx) => {
    const place = await tx.place.findFirst({ where: { id: placeId, ownerId }, select: { id: true } });
    if (!place) throw new PlaceReviewError("PLACE_NOT_FOUND");

    // Every linked post must resolve to a job before mutating; a place with no
    // links has nothing to audit and is refused too.
    const targets = await requireAuditTargetsForPlace(tx, ownerId, placeId);
    if (targets.length === 0) throw new PlaceReviewError("PLACE_REVIEW_AUDIT_CONTEXT_MISSING");

    await tx.place.update({ where: { id: placeId }, data: { reviewStatus: "REJECTED", isUserConfirmed: true } });
    await writeAuditEvidence(tx, ownerId, placeId, targets, "PLACE_REJECTED", reviewContext);
    return tx.place.findUniqueOrThrow({ where: { id: placeId } });
  });
}

export type CorrectPostPlaceInput = {
  postId: string;
  placeId: string;
  isPrimary?: boolean;
};

// Manually correct a post-place link: mark it user-confirmed, optionally make it
// the single primary, and record a bounded USER_CORRECTION audit evidence row.
export async function correctPostPlace(
  ownerId: string,
  input: CorrectPostPlaceInput,
  context: unknown,
): Promise<PostPlace> {
  const reviewContext = validateContext(context);
  return prisma.$transaction(async (tx) => {
    const link = await tx.postPlace.findUnique({
      where: { ownerId_postId_placeId: { ownerId, postId: input.postId, placeId: input.placeId } },
    });
    if (!link) throw new PlaceReviewError("POST_PLACE_NOT_FOUND");

    // The single affected post must resolve to a job before mutating (throws
    // PLACE_REVIEW_AUDIT_CONTEXT_MISSING otherwise), keeping one shared rule.
    const targets = await requireAuditTargetsForPosts(tx, ownerId, [
      { postId: input.postId, analysisJobId: link.analysisJobId },
    ]);

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

    await writeAuditEvidence(tx, ownerId, input.placeId, targets, "POST_PLACE_CORRECTED", reviewContext);

    return updated;
  });
}

export type MergePlacesInput = {
  sourcePlaceId: string;
  targetPlaceId: string;
};

// Merge the source canonical place into the target within one transaction:
// move or deduplicate links, move evidence, preserve the user's durable review
// decision, keep a single primary per post, delete the source, add a bounded
// merge audit evidence on the affected links, and roll back on any failure.
export async function mergePlaces(ownerId: string, input: MergePlacesInput, context: unknown): Promise<Place> {
  const reviewContext = validateContext(context);
  if (input.sourcePlaceId === input.targetPlaceId) throw new PlaceReviewError("INVALID_MERGE");

  return prisma.$transaction(
    async (tx) => {
      const source = await tx.place.findUnique({ where: { id: input.sourcePlaceId } });
      const target = await tx.place.findUnique({ where: { id: input.targetPlaceId } });
      if (!source || source.ownerId !== ownerId) throw new PlaceReviewError("PLACE_NOT_FOUND");
      if (!target || target.ownerId !== ownerId) throw new PlaceReviewError("PLACE_NOT_FOUND");

      const sourceLinks = await tx.postPlace.findMany({ where: { ownerId, placeId: input.sourcePlaceId } });

      // Resolve one auditable (post, job) per affected post before any write.
      // This throws if any affected post cannot be resolved to a job, so a
      // partially auditable merge never mutates. It returns one target per
      // distinct affected post, hence auditTargets.length === affectedPostIds.size.
      const auditTargets = await requireAuditTargetsForPosts(tx, ownerId, sourceLinks);
      // A link-free merge has no link-level audit context; refuse it before any
      // write so a merge can never delete the source without recording a proof.
      if (auditTargets.length === 0) throw new PlaceReviewError("PLACE_REVIEW_AUDIT_CONTEXT_MISSING");
      const affectedPostIds = new Set(auditTargets.map((target) => target.postId));

      for (const link of sourceLinks) {
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

      // Audit the merge on the affected links, now pointing at the target.
      await writeAuditEvidence(tx, ownerId, input.targetPlaceId, auditTargets, "PLACES_MERGED", reviewContext);

      return tx.place.findUniqueOrThrow({ where: { id: input.targetPlaceId } });
    },
    { timeout: 15_000 },
  );
}
