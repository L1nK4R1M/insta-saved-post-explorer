import { NextResponse } from "next/server";
import { z } from "zod";

import { getConfiguredOwnerId } from "@/auth/config";
import { requireExternalApiKey } from "@/auth/api-key";
import { ExternalApiNotFoundError, externalApiErrorResponse, externalApiJson } from "@/contracts/api/error";
import { getLibraryPost } from "@/server/library";

export const runtime = "nodejs";

const postIdSchema = z.string().trim().min(1).max(256);

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    requireExternalApiKey(request);
    const { id } = await context.params;
    const post = await getLibraryPost(postIdSchema.parse(id), getConfiguredOwnerId());
    if (!post) throw new ExternalApiNotFoundError();
    return externalApiJson(post);
  } catch (error: unknown) {
    return externalApiErrorResponse(error);
  }
}
