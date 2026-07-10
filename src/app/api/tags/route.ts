import { NextResponse } from "next/server";

import { getConfiguredOwnerId } from "@/auth/config";
import { errorResponse } from "@/server/http";
import { getLibraryTags } from "@/server/library";

export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  try {
    return NextResponse.json({ items: await getLibraryTags(getConfiguredOwnerId()) }, {
      headers: { "Cache-Control": "public, max-age=0, must-revalidate" },
    });
  } catch (error: unknown) {
    return errorResponse(error);
  }
}
