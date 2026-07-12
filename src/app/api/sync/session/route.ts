import { NextResponse } from "next/server";

import { authErrorResponse } from "@/auth/http";
import { requireSession } from "@/auth/session";
import { createSyncToken } from "@/auth/sync-token";
import { prisma } from "@/server/db";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const session = await requireSession();
    const job = await prisma.syncJob.create({ data: { ownerId: session.ownerId } });
    const knownExternalIds = await prisma.post.findMany({
      where: { ownerId: session.ownerId, externalId: { not: null } },
      select: { externalId: true },
      orderBy: { publishedAt: "desc" },
      take: 10_000,
    });
    return NextResponse.json({
      jobId: job.id,
      token: await createSyncToken(job.id, session.ownerId),
      apiBaseUrl: new URL(request.url).origin,
      knownExternalIds: knownExternalIds.flatMap((post) => post.externalId ? [post.externalId] : []),
      expiresInSeconds: 86_400,
    }, { status: 201 });
  } catch (error) {
    return authErrorResponse(error);
  }
}
