import { NextResponse } from "next/server";
import { z } from "zod";

import { authErrorResponse } from "@/auth/http";
import { requireSession } from "@/auth/session";
import {
  addTagToPost,
  AdminResourceNotFoundError,
  removeTagFromPost,
} from "@/server/admin-library";
import { errorResponse, readBoundedJsonBody } from "@/server/http";

export const runtime = "nodejs";

const postIdSchema = z.string().trim().min(1).max(256);
const tagMutationSchema = z.object({
  tag: z.string().trim().min(1).max(80),
}).strict();

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext): Promise<NextResponse> {
  return mutateTag(request, context, "add");
}

export async function DELETE(request: Request, context: RouteContext): Promise<NextResponse> {
  return mutateTag(request, context, "remove");
}

async function mutateTag(
  request: Request,
  context: RouteContext,
  operation: "add" | "remove",
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
    const { tag } = tagMutationSchema.parse(await readBoundedJsonBody(request, 4_096));
    const tags = operation === "add"
      ? await addTagToPost({ ownerId, postId, tagName: tag })
      : await removeTagFromPost({ ownerId, postId, tagName: tag });
    return NextResponse.json({ tags }, {
      status: operation === "add" ? 201 : 200,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error: unknown) {
    if (error instanceof AdminResourceNotFoundError) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }
    return errorResponse(error);
  }
}
