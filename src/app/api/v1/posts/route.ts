import { NextResponse } from "next/server";

import { getConfiguredOwnerId } from "@/auth/config";
import { requireExternalApiKey } from "@/auth/api-key";
import { externalApiErrorResponse, externalApiJson } from "@/contracts/api/error";
import { parseLibrarySearchParams } from "@/features/library/query-state";
import { getRandomLibraryPost, queryLibraryPosts } from "@/server/library";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<NextResponse> {
  try {
    requireExternalApiKey(request);
    const searchParams = new URL(request.url).searchParams;
    const query = parseLibrarySearchParams(searchParams);
    if (searchParams.get("random") === "1") {
      return externalApiJson({ item: await getRandomLibraryPost(query, getConfiguredOwnerId()) });
    }
    return externalApiJson(await queryLibraryPosts(query, getConfiguredOwnerId()));
  } catch (error: unknown) {
    return externalApiErrorResponse(error);
  }
}
