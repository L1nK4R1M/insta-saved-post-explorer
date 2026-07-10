import { z } from "zod";

const ownerIdSchema = z.string().trim().min(1).max(128).regex(/^[a-zA-Z0-9_-]+$/);
const authSecretSchema = z.string().min(32).max(4096);
const adminEmailSchema = z.string().trim().email().max(254).transform((email) => email.toLowerCase());
const bcryptHashSchema = z.string().regex(/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/);

export class AuthConfigurationError extends Error {
  constructor() {
    super("AUTH_CONFIGURATION_ERROR");
    this.name = "AuthConfigurationError";
  }
}

export type SessionConfiguration = {
  secret: Uint8Array;
  adminEmail: string;
  ownerId: string;
};

export type AdminCredentials = SessionConfiguration & {
  passwordHash: string;
};

export function isAuthDisabled(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.AUTH_DISABLED === "true";
}

export function isUnsafeProductionBypassRequested(): boolean {
  return process.env.NODE_ENV === "production" && process.env.AUTH_DISABLED === "true";
}

export function getSessionConfiguration(): SessionConfiguration {
  if (isUnsafeProductionBypassRequested()) throw new AuthConfigurationError();

  const secret = authSecretSchema.safeParse(process.env.AUTH_SECRET);
  const adminEmail = adminEmailSchema.safeParse(process.env.ADMIN_EMAIL);
  const ownerId = ownerIdSchema.safeParse(process.env.APP_OWNER_ID ?? "local");
  const passwordHash = bcryptHashSchema.safeParse(process.env.ADMIN_PASSWORD_HASH);

  if (!secret.success || !adminEmail.success || !ownerId.success || !passwordHash.success) {
    throw new AuthConfigurationError();
  }

  return {
    secret: new TextEncoder().encode(secret.data),
    adminEmail: adminEmail.data,
    ownerId: ownerId.data,
  };
}

export function getAdminCredentials(): AdminCredentials {
  const configuration = getSessionConfiguration();
  const passwordHash = bcryptHashSchema.safeParse(process.env.ADMIN_PASSWORD_HASH);
  if (!passwordHash.success) throw new AuthConfigurationError();
  return { ...configuration, passwordHash: passwordHash.data };
}

export function getAuthConfigurationStatus(): "disabled" | "configured" | "missing" {
  if (isAuthDisabled()) return "disabled";
  try {
    getAdminCredentials();
    return "configured";
  } catch {
    return "missing";
  }
}

export function getConfiguredOwnerId(): string {
  const ownerId = ownerIdSchema.safeParse(process.env.APP_OWNER_ID ?? "local");
  if (!ownerId.success) throw new AuthConfigurationError();
  return ownerId.data;
}
