"use server";

import { revalidatePath } from "next/cache";

import { getConfiguredOwnerId } from "@/auth/config";
import { getSession } from "@/auth/session";
import type { PlacePostSummaryDto } from "@/contracts/api/places";
import { getPlacePosts } from "@/server/places/queries";
import { confirmPlace, PlaceReviewError, rejectPlaceResult } from "@/server/places/review";

// Internal Server Actions for the Places UI. Review writes go through the
// existing owner-scoped services in src/server/places/review.ts — the external
// /api/v1 key stays read-only and is never used for a mutation. Every action
// re-checks the session server-side: hiding a button in the UI is not a control.

export type PlaceActionResult = { ok: true } | { ok: false; code: string };

const REVIEW_REASON = "Revue manuelle depuis la page Places";

async function requireAdmin(): Promise<string | null> {
  const session = await getSession().catch(() => null);
  return session?.role === "admin" ? getConfiguredOwnerId() : null;
}

function toActionResult(error: unknown): PlaceActionResult {
  // Only a stable code crosses the boundary: never an actor, a reason or a raw
  // Prisma message.
  if (error instanceof PlaceReviewError) return { ok: false, code: error.code };
  return { ok: false, code: "PLACE_REVIEW_FAILED" };
}

export async function confirmPlaceAction(placeId: string): Promise<PlaceActionResult> {
  const ownerId = await requireAdmin();
  if (!ownerId) return { ok: false, code: "FORBIDDEN" };
  try {
    await confirmPlace(ownerId, placeId, {
      actor: { type: "USER", id: ownerId },
      reason: REVIEW_REASON,
    });
    revalidatePath("/places");
    return { ok: true };
  } catch (error) {
    return toActionResult(error);
  }
}

export async function rejectPlaceAction(placeId: string): Promise<PlaceActionResult> {
  const ownerId = await requireAdmin();
  if (!ownerId) return { ok: false, code: "FORBIDDEN" };
  try {
    await rejectPlaceResult(ownerId, placeId, {
      actor: { type: "USER", id: ownerId },
      reason: REVIEW_REASON,
    });
    revalidatePath("/places");
    return { ok: true };
  } catch (error) {
    return toActionResult(error);
  }
}

export type PlacePostsResult =
  | { ok: true; posts: PlacePostSummaryDto[] }
  | { ok: false; code: string };

// Load the posts of a place on demand for the detail sheet, owner-scoped. A
// place owned by someone else behaves as absent.
export async function loadPlacePostsAction(placeId: string): Promise<PlacePostsResult> {
  try {
    const ownerId = getConfiguredOwnerId();
    const page = await getPlacePosts(placeId, { limit: 24 }, ownerId);
    if (!page) return { ok: false, code: "NOT_FOUND" };
    return { ok: true, posts: page.items };
  } catch {
    return { ok: false, code: "PLACE_POSTS_FAILED" };
  }
}
