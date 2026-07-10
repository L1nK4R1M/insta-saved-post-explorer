import { jwtVerify, SignJWT } from "jose";
import { z } from "zod";

import {
  SESSION_AUDIENCE,
  SESSION_DURATION_SECONDS,
  SESSION_ISSUER,
} from "@/auth/constants";
import { AuthConfigurationError, getSessionConfiguration } from "@/auth/config";

const sessionPayloadSchema = z.object({
  sub: z.string().min(1).max(128),
  email: z.string().email(),
  role: z.literal("admin"),
});

export type AuthSession = {
  ownerId: string;
  email: string;
  role: "admin";
  bypass: boolean;
};

export async function createSessionToken(): Promise<string> {
  const configuration = getSessionConfiguration();
  return new SignJWT({ email: configuration.adminEmail, role: "admin" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(configuration.ownerId)
    .setIssuer(SESSION_ISSUER)
    .setAudience(SESSION_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_SECONDS}s`)
    .sign(configuration.secret);
}

export async function verifySessionToken(token: string): Promise<AuthSession | null> {
  try {
    const configuration = getSessionConfiguration();
    const { payload } = await jwtVerify(token, configuration.secret, {
      algorithms: ["HS256"],
      issuer: SESSION_ISSUER,
      audience: SESSION_AUDIENCE,
      clockTolerance: 5,
    });
    const parsed = sessionPayloadSchema.safeParse(payload);
    if (!parsed.success) return null;
    if (parsed.data.sub !== configuration.ownerId) return null;
    if (parsed.data.email.toLowerCase() !== configuration.adminEmail) return null;
    return {
      ownerId: parsed.data.sub,
      email: parsed.data.email,
      role: parsed.data.role,
      bypass: false,
    };
  } catch (error: unknown) {
    if (error instanceof AuthConfigurationError) throw error;
    return null;
  }
}
