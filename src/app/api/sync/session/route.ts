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
    const knownPosts = await prisma.post.findMany({
      where: { ownerId: session.ownerId },
      select: { externalId: true, postUrl: true },
      orderBy: [
        { publishedAt: { sort: "desc", nulls: "last" } },
        { createdAt: "desc" },
        { id: "desc" },
      ],
      take: 10_000,
    });
    const knownPostCodes = knownPosts.flatMap((post) => {
      try {
        const code = new URL(post.postUrl).pathname.split("/").filter(Boolean).at(-1);
        return code ? [code] : [];
      } catch {
        return [];
      }
    });
    return NextResponse.json({
      jobId: job.id,
      token: await createSyncToken(job.id, session.ownerId),
      apiBaseUrl: new URL(request.url).origin,
      knownExternalIds: knownPosts.flatMap((post) => post.externalId ? [post.externalId] : []),
      knownPostCodes,
      expiresInSeconds: 86_400,
    }, { status: 201 });
  } catch (error) {
    return authErrorResponse(error);
  }
}
