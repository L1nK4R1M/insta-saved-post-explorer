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
  const { pathname, search } = request.nextUrl;
  const isApi = pathname.startsWith("/api/");
  const isLogin = pathname === "/login";
  const isPublic = isLogin || pathname.startsWith("/api/auth/") || pathname === "/api/health";

  if (isUnsafeProductionBypassRequested()) {
    if (isLogin) return NextResponse.next();
    return isApi
      ? NextResponse.json({ error: "AUTH_UNAVAILABLE" }, { status: 503 })
      : redirectToLogin(request, pathname + search, "configuration");
  }

  if (isAuthDisabled()) {
    if (!bypassWarningShown) {
      console.warn("[security] AUTH_DISABLED=true: development authentication bypass is active.");
      bypassWarningShown = true;
    }
    const response = NextResponse.next();
    response.headers.set("X-Auth-Bypass", "development-only");
    return response;
  }

  if (isPublic && !isLogin) return NextResponse.next();

  try {
    const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    const session = token ? await verifySessionToken(token) : null;

    if (isLogin) {
      return session ? NextResponse.redirect(new URL("/", request.url)) : NextResponse.next();
    }
    if (session) return NextResponse.next();
    if (isApi) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    return redirectToLogin(request, pathname + search);
  } catch (error: unknown) {
    if (!(error instanceof AuthConfigurationError)) {
      return isApi
        ? NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 })
        : redirectToLogin(request, pathname + search);
    }
    return isApi
      ? NextResponse.json({ error: "AUTH_UNAVAILABLE" }, { status: 503 })
      : redirectToLogin(request, pathname + search, "configuration");
  }
}

function redirectToLogin(
  request: NextRequest,
  nextPath: string,
  error?: "configuration",
): NextResponse {
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", nextPath);
  if (error) loginUrl.searchParams.set("error", error);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)"],
};
