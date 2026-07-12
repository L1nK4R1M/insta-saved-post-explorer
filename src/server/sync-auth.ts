import "server-only";

import { verifySyncToken } from "@/auth/sync-token";

export async function requireSyncToken(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) throw new Error("SYNC_UNAUTHORIZED");
  return verifySyncToken(authorization.slice(7));
}
