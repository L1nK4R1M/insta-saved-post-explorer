import { NextResponse } from "next/server";
import { z } from "zod";

import { getConfiguredOwnerId } from "@/auth/config";
import { requireExternalApiKey } from "@/auth/api-key";
import { ExternalApiNotFoundError, externalApiErrorResponse, externalApiJson } from "@/contracts/api/error";
import { getPlaceAnalysisJob } from "@/server/places/queries";

export const runtime = "nodejs";

const jobIdSchema = z.string().trim().min(1).max(256);

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    requireExternalApiKey(request);
    const { id } = await context.params;
    const job = await getPlaceAnalysisJob(jobIdSchema.parse(id), getConfiguredOwnerId());
    if (!job) throw new ExternalApiNotFoundError();
    return externalApiJson(job);
  } catch (error: unknown) {
    return externalApiErrorResponse(error);
  }
}
