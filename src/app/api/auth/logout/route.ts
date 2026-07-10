import { NextResponse } from "next/server";

import { SESSION_COOKIE_NAME } from "@/auth/constants";
import { getSessionCookieOptions } from "@/auth/session";

export async function POST(request: Request): Promise<NextResponse> {
  const response = NextResponse.redirect(new URL("/login", request.url), 303);
  response.headers.set("Cache-Control", "no-store");
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    ...getSessionCookieOptions(),
    maxAge: 0,
    expires: new Date(0),
  });
  return response;
}
