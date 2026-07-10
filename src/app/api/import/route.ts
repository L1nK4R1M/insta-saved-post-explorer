import { NextResponse } from "next/server";
import { z } from "zod";

import { authErrorResponse } from "@/auth/http";
import { requireSession } from "@/auth/session";
import { errorResponse, getImportBodyLimit, readBoundedJsonBody } from "@/server/http";
import { importPosts } from "@/server/import-posts";

export const runtime = "nodejs";
export const maxDuration = 60;

const sourceNameSchema = z.string().trim().min(1).max(255).optional();
const idempotencyKeySchema = z
  .string()
  .trim()
  .min(8)
  .max(128)
  .regex(/^[a-zA-Z0-9._:-]+$/)
  .optional();

export async function POST(request: Request): Promise<NextResponse> {
  let ownerId: string;
  try {
    ownerId = (await requireSession()).ownerId;
  } catch (error: unknown) {
    return authErrorResponse(error);
  }

  try {
    const sourceName = sourceNameSchema.parse(
      new URL(request.url).searchParams.get("sourceName") ?? undefined,
    );
    const idempotencyKey = idempotencyKeySchema.parse(
      request.headers.get("idempotency-key") ?? undefined,
    );
    const input = await readBoundedJsonBody(request, getImportBodyLimit());
    const report = await importPosts(input, {
      ownerId,
      sourceName,
      idempotencyKey,
      batchSize: 100,
    });
    return NextResponse.json(report, { status: 201 });
  } catch (error: unknown) {
    return errorResponse(error);
  }
}
