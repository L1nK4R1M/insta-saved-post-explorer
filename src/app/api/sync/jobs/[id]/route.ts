import { NextResponse } from "next/server";

import { authErrorResponse } from "@/auth/http";
import { requireSession } from "@/auth/session";
import { prisma } from "@/server/db";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession();
    const { id } = await context.params;
    const job = await prisma.syncJob.findFirst({ where: { id, ownerId: session.ownerId } });
    return job
      ? NextResponse.json(job)
      : NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  } catch (error) {
    return authErrorResponse(error);
  }
}
