import { NextResponse } from "next/server";

import { getConfiguredOwnerId } from "@/auth/config";
import { requireExternalApiKey } from "@/auth/api-key";
import { externalApiErrorResponse, externalApiJson } from "@/contracts/api/error";
import { getLibraryCollections } from "@/server/library";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<NextResponse> {
  try {
    requireExternalApiKey(request);
    return externalApiJson({ items: await getLibraryCollections(getConfiguredOwnerId()) });
  } catch (error: unknown) {
    return externalApiErrorResponse(error);
  }
}
