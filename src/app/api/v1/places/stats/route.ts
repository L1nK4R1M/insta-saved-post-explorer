import { NextResponse } from "next/server";

import { getConfiguredOwnerId } from "@/auth/config";
import { requireExternalApiKey } from "@/auth/api-key";
import { externalApiErrorResponse, externalApiJson } from "@/contracts/api/error";
import { parsePlacesStatsParams } from "@/contracts/api/places";
import { getPlacesStats } from "@/server/places/stats";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<NextResponse> {
  try {
    requireExternalApiKey(request);
    const params = parsePlacesStatsParams(new URL(request.url).searchParams);
    return externalApiJson(await getPlacesStats(params, getConfiguredOwnerId()));
  } catch (error: unknown) {
    return externalApiErrorResponse(error);
  }
}
