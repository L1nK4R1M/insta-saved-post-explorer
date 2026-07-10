import { NextResponse } from "next/server";

import { getAuthConfigurationStatus } from "@/auth/config";
import { databaseConfigured, prisma } from "@/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const authentication = getAuthConfigurationStatus();
  const version = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local";

  if (!databaseConfigured || authentication !== "configured") {
    return NextResponse.json(
      {
        status: "not_ready",
        database: databaseConfigured ? "unverified" : "missing",
        authentication,
        version,
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json(
      { status: "ok", database: "connected", authentication, version },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { status: "not_ready", database: "unreachable", authentication, version },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
