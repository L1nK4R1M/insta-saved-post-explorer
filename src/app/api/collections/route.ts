import { NextResponse } from "next/server";
import { z } from "zod";
import { getConfiguredOwnerId } from "@/auth/config";
import { authErrorResponse } from "@/auth/http";
import { requireSession } from "@/auth/session";
import { createCollection } from "@/server/collections";
import { errorResponse, readBoundedJsonBody } from "@/server/http";
import { getLibraryCollections } from "@/server/library";

export async function GET() { try { return NextResponse.json(await getLibraryCollections(getConfiguredOwnerId()), { headers: { "Cache-Control": "public, max-age=0, must-revalidate" } }); } catch (error) { return errorResponse(error); } }
export async function POST(request: Request) {
  let ownerId: string; try { ownerId = (await requireSession()).ownerId; } catch (error) { return authErrorResponse(error); }
  try { const body = z.object({ name: z.string() }).strict().parse(await readBoundedJsonBody(request, 4096)); return NextResponse.json(await createCollection(ownerId, body.name), { status: 201, headers: { "Cache-Control": "private, no-store" } }); } catch (error) { return errorResponse(error); }
}
