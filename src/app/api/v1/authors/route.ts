import { NextResponse } from "next/server";
import { z } from "zod";

import { getConfiguredOwnerId } from "@/auth/config";
import { requireExternalApiKey } from "@/auth/api-key";
import { externalApiErrorResponse, externalApiJson } from "@/contracts/api/error";
import { getLibraryAuthors } from "@/server/library";

export const runtime = "nodejs";

const querySchema = z.object({
  q: z.string().trim().max(64).default(""),
  limit: z.coerce.number().int().min(1).max(50).default(12),
});

export async function GET(request: Request): Promise<NextResponse> {
  try {
    requireExternalApiKey(request);
    const url = new URL(request.url);
    const query = querySchema.parse({
      q: url.searchParams.get("q") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
    });
    const items = await getLibraryAuthors(getConfiguredOwnerId(), query.q, query.limit);
    return externalApiJson({ items, query: query.q, limit: query.limit });
  } catch (error: unknown) {
    return externalApiErrorResponse(error);
  }
}
