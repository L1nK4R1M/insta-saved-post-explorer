import { NextResponse } from "next/server";
import { z } from "zod";

import { getConfiguredOwnerId } from "@/auth/config";
import { authErrorResponse } from "@/auth/http";
import { requireSession } from "@/auth/session";
import { AdminResourceNotFoundError, deleteOwnedPost } from "@/server/admin-library";
import { errorResponse } from "@/server/http";
import { getLibraryPost } from "@/server/library";

export const runtime = "nodejs";

const postIdSchema = z.string().trim().min(1).max(256);

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { id } = await context.params;
    const post = await getLibraryPost(postIdSchema.parse(id), getConfiguredOwnerId());
    if (!post) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    return NextResponse.json(post, {
      headers: { "Cache-Control": "public, max-age=0, must-revalidate" },
    });
  } catch (error: unknown) {
    return errorResponse(error);
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  let ownerId: string;
  try {
    ownerId = (await requireSession()).ownerId;
  } catch (error: unknown) {
    return authErrorResponse(error);
  }

  try {
    const { id } = await context.params;
    const postId = postIdSchema.parse(id);
    await deleteOwnedPost({ ownerId, postId });
    return NextResponse.json({ deleted: true, id: postId }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error: unknown) {
    if (error instanceof AdminResourceNotFoundError) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }
    return errorResponse(error);
  }
}
