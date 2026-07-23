import { NextResponse } from "next/server";

import { getConfiguredOwnerId } from "@/auth/config";
import { requireExternalApiKey } from "@/auth/api-key";
import { externalApiErrorResponse, externalApiJson } from "@/contracts/api/error";
import { getLibraryStats } from "@/server/library";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<NextResponse> {
  try {
    requireExternalApiKey(request);
    // Note: `totalLikes` is the sum of likes received by imported posts, not the
    // number of posts the owner liked. Do not rename it in V1.
    return externalApiJson(await getLibraryStats(getConfiguredOwnerId()));
  } catch (error: unknown) {
    return externalApiErrorResponse(error);
  }
}
