import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/server/db";
import { requireSyncToken } from "@/server/sync-auth";

const bodySchema = z.object({
  status: z.enum(["completed", "failed"]),
  error: z.string().max(255).nullable().optional(),
  mediaFailed: z.number().int().nonnegative().default(0),
});

export async function POST(request: Request) {
  try {
    const claims = await requireSyncToken(request);
    const body = bodySchema.parse(await request.json());
    await prisma.syncJob.updateMany({
      where: { id: claims.sub, ownerId: claims.ownerId },
      data: {
        status: body.status === "completed" ? "COMPLETED" : "FAILED",
        errorCode: body.error ?? null,
        mediaFailed: { increment: body.mediaFailed },
        heartbeatAt: new Date(),
        finishedAt: new Date(),
      },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "INTERNAL_ERROR";
    return NextResponse.json({ error: message }, { status: message === "SYNC_UNAUTHORIZED" ? 401 : 400 });
  }
}
