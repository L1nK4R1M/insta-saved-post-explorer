import { NextResponse } from "next/server";

import { getConfiguredOwnerId } from "@/auth/config";
import { parseLibrarySearchParams } from "@/features/library/query-state";
import { errorResponse } from "@/server/http";
import { getRandomLibraryPost, queryLibraryPosts } from "@/server/library";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const searchParams = new URL(request.url).searchParams;
    const query = parseLibrarySearchParams(searchParams);
    if (searchParams.get("random") === "1") {
      return NextResponse.json({ item: await getRandomLibraryPost(query, getConfiguredOwnerId()) });
    }
    const page = await queryLibraryPosts(query, getConfiguredOwnerId());
    return NextResponse.json(page, {
      headers: { "Cache-Control": "public, max-age=0, must-revalidate" },
    });
  } catch (error: unknown) {
    return errorResponse(error);
  }
}
