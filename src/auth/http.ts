import "server-only";

import { NextResponse } from "next/server";

import { AuthConfigurationError } from "@/auth/config";
import { UnauthorizedError } from "@/auth/session";

export function authErrorResponse(error: unknown): NextResponse {
  if (error instanceof UnauthorizedError) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  if (error instanceof AuthConfigurationError) {
    return NextResponse.json({ error: "AUTH_UNAVAILABLE" }, { status: 503 });
  }
  return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
}
