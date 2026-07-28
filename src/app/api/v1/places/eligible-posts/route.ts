import { NextResponse } from "next/server";

import { getConfiguredOwnerId } from "@/auth/config";
import { requireExternalApiKey } from "@/auth/api-key";
import { externalApiErrorResponse, externalApiJson } from "@/contracts/api/error";
import { parseCursorPageParams } from "@/contracts/api/places";
import { queryEligiblePosts } from "@/server/places/queries";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<NextResponse> {
  try {
    requireExternalApiKey(request);
    const params = parseCursorPageParams(new URL(request.url).searchParams);
    return externalApiJson(await queryEligiblePosts(params, getConfiguredOwnerId()));
  } catch (error: unknown) {
    return externalApiErrorResponse(error);
  }
}
