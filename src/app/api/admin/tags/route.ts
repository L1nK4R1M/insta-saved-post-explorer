import { NextResponse } from "next/server";
import { requireSession } from "@/auth/session";
import { getAdminTags } from "@/server/admin-insights";
import { adminApiErrorResponse } from "@/server/admin-http";

export async function GET(request: Request) {
  try {
    const session = await requireSession();
    return NextResponse.json(await getAdminTags(session.ownerId, new URL(request.url).searchParams.get("q") ?? ""), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return adminApiErrorResponse(error); }
}
