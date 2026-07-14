import { NextResponse } from "next/server";
import { requireSession } from "@/auth/session";
import { getAdminInsights } from "@/server/admin-insights";
import { adminApiErrorResponse } from "@/server/admin-http";

export async function GET() {
  try { const session = await requireSession(); return NextResponse.json(await getAdminInsights(session.ownerId), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return adminApiErrorResponse(error); }
}
