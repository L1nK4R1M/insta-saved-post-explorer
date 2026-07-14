import { NextResponse } from "next/server";
import { z } from "zod";
import { authErrorResponse } from "@/auth/http";
import { requireSession } from "@/auth/session";
import { AdminResourceNotFoundError } from "@/server/admin-library";
import { deleteCollection, renameCollection } from "@/server/collections";
import { errorResponse, readBoundedJsonBody } from "@/server/http";
type Context = { params: Promise<{ id: string }> };
async function owner() { return (await requireSession()).ownerId; }
export async function PATCH(request: Request, context: Context) { let ownerId; try { ownerId = await owner(); } catch (error) { return authErrorResponse(error); } try { const { id } = await context.params; const { name } = z.object({ name: z.string() }).strict().parse(await readBoundedJsonBody(request, 4096)); return NextResponse.json(await renameCollection(ownerId, id, name)); } catch (error) { if (error instanceof AdminResourceNotFoundError) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 }); return errorResponse(error); } }
export async function DELETE(_request: Request, context: Context) { let ownerId; try { ownerId = await owner(); } catch (error) { return authErrorResponse(error); } try { const { id } = await context.params; await deleteCollection(ownerId, id); return NextResponse.json({ deleted: true }); } catch (error) { if (error instanceof AdminResourceNotFoundError) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 }); return errorResponse(error); } }
