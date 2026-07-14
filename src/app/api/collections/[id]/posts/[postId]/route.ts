import { NextResponse } from "next/server";
import { authErrorResponse } from "@/auth/http";
import { requireSession } from "@/auth/session";
import { AdminResourceNotFoundError } from "@/server/admin-library";
import { setPostCollection } from "@/server/collections";
import { errorResponse } from "@/server/http";
type Context = { params: Promise<{ id: string; postId: string }> };
async function mutate(context: Context, included: boolean) { let ownerId; try { ownerId = (await requireSession()).ownerId; } catch (error) { return authErrorResponse(error); } try { const { id, postId } = await context.params; return NextResponse.json(await setPostCollection(ownerId, id, postId, included), { headers: { "Cache-Control": "private, no-store" } }); } catch (error) { if (error instanceof AdminResourceNotFoundError) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 }); return errorResponse(error); } }
export async function PUT(_request: Request, context: Context) { return mutate(context, true); }
export async function DELETE(_request: Request, context: Context) { return mutate(context, false); }
