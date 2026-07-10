import { NextResponse } from "next/server";

import { authErrorResponse } from "@/auth/http";
import { requireSession } from "@/auth/session";
import { parseLibrarySearchParams } from "@/features/library/query-state";
import { errorResponse } from "@/server/http";
import { queryLibraryPosts } from "@/server/library";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<NextResponse> {
  let ownerId: string;
  try {
    ownerId = (await requireSession()).ownerId;
  } catch (error: unknown) {
    return authErrorResponse(error);
  }

  try {
    const query = parseLibrarySearchParams(new URL(request.url).searchParams);
    const page = await queryLibraryPosts(query, ownerId);
    return NextResponse.json(page, {
      headers: { "Cache-Control": "private, max-age=0, must-revalidate" },
    });
  } catch (error: unknown) {
    return errorResponse(error);
  }
}
