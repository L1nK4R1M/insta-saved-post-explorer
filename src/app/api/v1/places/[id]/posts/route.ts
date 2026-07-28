import { NextResponse } from "next/server";
import { z } from "zod";

import { getConfiguredOwnerId } from "@/auth/config";
import { requireExternalApiKey } from "@/auth/api-key";
import { ExternalApiNotFoundError, externalApiErrorResponse, externalApiJson } from "@/contracts/api/error";
import { parseCursorPageParams } from "@/contracts/api/places";
import { getPlacePosts } from "@/server/places/queries";

export const runtime = "nodejs";

const placeIdSchema = z.string().trim().min(1).max(256);

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    requireExternalApiKey(request);
    const { id } = await context.params;
    const params = parseCursorPageParams(new URL(request.url).searchParams);
    const page = await getPlacePosts(placeIdSchema.parse(id), params, getConfiguredOwnerId());
    if (!page) throw new ExternalApiNotFoundError();
    return externalApiJson(page);
  } catch (error: unknown) {
    return externalApiErrorResponse(error);
  }
}
