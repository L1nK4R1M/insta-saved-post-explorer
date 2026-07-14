import { NextResponse } from "next/server";
import { z } from "zod";

import { getConfiguredOwnerId } from "@/auth/config";
import { errorResponse } from "@/server/http";
import { getLibraryAuthors } from "@/server/library";

export const runtime = "nodejs";

const querySchema = z.object({
  q: z.string().trim().max(64).default(""),
  limit: z.coerce.number().int().min(1).max(50).default(12),
});

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const url = new URL(request.url);
    const query = querySchema.parse({ q: url.searchParams.get("q") ?? undefined, limit: url.searchParams.get("limit") ?? undefined });
    const items = await getLibraryAuthors(getConfiguredOwnerId(), query.q, query.limit);
    return NextResponse.json({ items, query: query.q, limit: query.limit }, { headers: { "Cache-Control": "public, max-age=0, must-revalidate" } });
  } catch (error: unknown) {
    return errorResponse(error);
  }
}
