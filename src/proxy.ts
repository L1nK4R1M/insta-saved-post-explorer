import { NextRequest, NextResponse } from "next/server";

import { SESSION_COOKIE_NAME } from "@/auth/constants";
import {
  AuthConfigurationError,
  isAuthDisabled,
  isUnsafeProductionBypassRequested,
} from "@/auth/config";
import { verifySessionToken } from "@/auth/token";

let bypassWarningShown = false;

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const isLogin = request.nextUrl.pathname === "/login";

  if (isAuthDisabled()) {
    if (!bypassWarningShown) {
      console.warn("[security] AUTH_DISABLED=true: development authentication bypass is active.");
      bypassWarningShown = true;
    }
    const response = isLogin
      ? NextResponse.redirect(new URL("/", request.url))
      : NextResponse.next();
    response.headers.set("X-Auth-Bypass", "development-only");
    return response;
  }

  // Public browsing must stay available even when admin authentication is
  // misconfigured. Mutation handlers still call requireSession() and fail closed.
  if (!isLogin || isUnsafeProductionBypassRequested()) return NextResponse.next();

  try {
    const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    const session = token ? await verifySessionToken(token) : null;
    return session
      ? NextResponse.redirect(new URL("/", request.url))
      : NextResponse.next();
  } catch (error: unknown) {
    if (!(error instanceof AuthConfigurationError)) {
      console.warn("[auth] Unable to verify the admin session.");
    }
    return NextResponse.next();
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)"],
};
