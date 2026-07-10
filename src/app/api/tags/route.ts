import { NextResponse } from "next/server";

import { authErrorResponse } from "@/auth/http";
import { requireSession } from "@/auth/session";
import { errorResponse } from "@/server/http";
import { getLibraryTags } from "@/server/library";

export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  let ownerId: string;
  try {
    ownerId = (await requireSession()).ownerId;
  } catch (error: unknown) {
    return authErrorResponse(error);
  }

  try {
    return NextResponse.json({ items: await getLibraryTags(ownerId) }, {
      headers: { "Cache-Control": "private, max-age=0, must-revalidate" },
    });
  } catch (error: unknown) {
    return errorResponse(error);
  }
}
