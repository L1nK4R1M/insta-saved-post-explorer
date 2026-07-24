import { NextResponse } from "next/server";
import { z } from "zod";

import { getConfiguredOwnerId } from "@/auth/config";
import { requireExternalApiKey } from "@/auth/api-key";
import { ExternalApiNotFoundError, externalApiErrorResponse, externalApiJson } from "@/contracts/api/error";
import { getPlaceDetail } from "@/server/places/queries";

export const runtime = "nodejs";

const placeIdSchema = z.string().trim().min(1).max(256);

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    requireExternalApiKey(request);
    const { id } = await context.params;
    const place = await getPlaceDetail(placeIdSchema.parse(id), getConfiguredOwnerId());
    if (!place) throw new ExternalApiNotFoundError();
    return externalApiJson(place);
  } catch (error: unknown) {
    return externalApiErrorResponse(error);
  }
}
