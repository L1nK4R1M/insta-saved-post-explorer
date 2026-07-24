import { NextResponse } from "next/server";

import { getConfiguredOwnerId } from "@/auth/config";
import { requireExternalApiKey } from "@/auth/api-key";
import { externalApiErrorResponse, externalApiJson } from "@/contracts/api/error";
import { parsePlacesListParams } from "@/contracts/api/places";
import { queryPlaces } from "@/server/places/queries";

export const runtime = "nodejs";

// Read-only list of owner-scoped places with cursor pagination and filters.
export async function GET(request: Request): Promise<NextResponse> {
  try {
    requireExternalApiKey(request);
    const params = parsePlacesListParams(new URL(request.url).searchParams);
    return externalApiJson(await queryPlaces(params, getConfiguredOwnerId()));
  } catch (error: unknown) {
    return externalApiErrorResponse(error);
  }
}
