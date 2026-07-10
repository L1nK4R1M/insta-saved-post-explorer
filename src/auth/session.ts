import "server-only";

import { cookies } from "next/headers";

import { SESSION_COOKIE_NAME, SESSION_DURATION_SECONDS } from "@/auth/constants";
import { getConfiguredOwnerId, isAuthDisabled } from "@/auth/config";
import { verifySessionToken, type AuthSession } from "@/auth/token";

export class UnauthorizedError extends Error {
  constructor() {
    super("UNAUTHORIZED");
    this.name = "UnauthorizedError";
  }
}
export function getSessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DURATION_SECONDS,
  };
}

export async function getSession(): Promise<AuthSession | null> {
  if (isAuthDisabled()) {
    return {
      ownerId: getConfiguredOwnerId(),
      email: "development-bypass@localhost",
      role: "admin",
      bypass: true,
    };
  }

  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  return token ? verifySessionToken(token) : null;
}

export async function requireSession(): Promise<AuthSession> {
  const session = await getSession();
  if (!session) throw new UnauthorizedError();
  return session;
}
