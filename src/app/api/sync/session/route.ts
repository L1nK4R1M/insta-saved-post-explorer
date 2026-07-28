import { NextResponse } from "next/server";

import { authErrorResponse } from "@/auth/http";
import { requireSession } from "@/auth/session";
import { createSyncToken } from "@/auth/sync-token";
import { prisma } from "@/server/db";
import { buildSyncKnownPosts } from "@/server/sync-session";

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
    const knownPostIdentities = buildSyncKnownPosts(knownPosts);
    return NextResponse.json({
      jobId: job.id,
      token: await createSyncToken(job.id, session.ownerId),
      apiBaseUrl: new URL(request.url).origin,
      knownExternalIds: knownPostIdentities.flatMap((post) =>
        post.externalId ? [post.externalId] : []
      ),
      knownPostCodes: knownPostIdentities.flatMap((post) =>
        post.postCode ? [post.postCode] : []
      ),
      knownPosts: knownPostIdentities,
      expiresInSeconds: 86_400,
    }, { status: 201 });
  } catch (error) {
    return authErrorResponse(error);
  }
}
