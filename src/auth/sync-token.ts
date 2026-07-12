import "server-only";

import { jwtVerify, SignJWT } from "jose";
import { z } from "zod";

import { getSessionConfiguration } from "@/auth/config";

const claimsSchema = z.object({
  sub: z.string().min(1),
  ownerId: z.string().min(1),
  scope: z.literal("instagram-sync"),
});

export async function createSyncToken(jobId: string, ownerId: string): Promise<string> {
  const { secret } = getSessionConfiguration();
  return new SignJWT({ ownerId, scope: "instagram-sync" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(jobId)
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(secret);
}

export async function verifySyncToken(token: string) {
  const { secret } = getSessionConfiguration();
  const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"] });
  return claimsSchema.parse(payload);
}
