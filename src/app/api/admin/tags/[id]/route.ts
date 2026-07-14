import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/auth/session";
import { AdminConflictError, deleteAdminTag, mergeAdminTags, renameAdminTag } from "@/server/admin-insights";
import { adminApiErrorResponse } from "@/server/admin-http";

const patchSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("rename"), name: z.string() }),
  z.object({ action: z.literal("merge"), targetId: z.string() }),
]);
type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  try {
    const session = await requireSession();
    const { id } = await context.params;
    const input = patchSchema.parse(await request.json());
    const result = input.action === "rename"
      ? await renameAdminTag(session.ownerId, id, input.name)
      : await mergeAdminTags(session.ownerId, id, input.targetId);
    return NextResponse.json(result);
  } catch (error) { return adminError(error); }
}

export async function DELETE(_request: Request, context: Context) {
  try {
    const session = await requireSession();
    const { id } = await context.params;
    return NextResponse.json(await deleteAdminTag(session.ownerId, id));
  } catch (error) { return adminError(error); }
}

function adminError(error: unknown) {
  if (error instanceof AdminConflictError) return NextResponse.json({ error: error.message }, { status: error.message === "TAG_NOT_FOUND" ? 404 : 409 });
  return adminApiErrorResponse(error);
}
