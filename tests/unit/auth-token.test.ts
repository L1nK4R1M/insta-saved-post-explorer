// @vitest-environment node

import { SignJWT } from "jose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  SESSION_AUDIENCE,
  SESSION_ISSUER,
} from "@/auth/constants";
import { createSessionToken, verifySessionToken } from "@/auth/token";

const TEST_SECRET = "qa-only-secret-material-32-bytes-minimum";
const SYNTACTIC_BCRYPT_HASH = `$2b$12$${"A".repeat(53)}`;

describe("jetons de session administrateur", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "test");
    process.env.AUTH_SECRET = TEST_SECRET;
    process.env.ADMIN_EMAIL = "admin.qa@example.com";
    process.env.ADMIN_PASSWORD_HASH = SYNTACTIC_BCRYPT_HASH;
    process.env.APP_OWNER_ID = "qa-owner";
    process.env.AUTH_DISABLED = "false";
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("crée puis vérifie un JWT lié à l'owner et à l'administrateur configurés", async () => {
    const token = await createSessionToken();

    await expect(verifySessionToken(token)).resolves.toEqual({
      ownerId: "qa-owner",
      email: "admin.qa@example.com",
      role: "admin",
      bypass: false,
    });
  });

  it("refuse un jeton altéré ou signé avec un autre secret", async () => {
    const token = await createSessionToken();
    await expect(verifySessionToken(`${token}x`)).resolves.toBeNull();

    process.env.AUTH_SECRET = "another-qa-secret-material-32-bytes-minimum";
    await expect(verifySessionToken(token)).resolves.toBeNull();
  });

  it("invalide un jeton si l'owner ou l'e-mail configuré change", async () => {
    const token = await createSessionToken();

    process.env.APP_OWNER_ID = "other-owner";
    await expect(verifySessionToken(token)).resolves.toBeNull();

    process.env.APP_OWNER_ID = "qa-owner";
    process.env.ADMIN_EMAIL = "other-admin@example.com";
    await expect(verifySessionToken(token)).resolves.toBeNull();
  });

  it("refuse les jetons expirés et les claims inattendus", async () => {
    const expired = await signedToken({ role: "admin", audience: SESSION_AUDIENCE, expiresIn: "-10s" });
    const wrongRole = await signedToken({ role: "reader", audience: SESSION_AUDIENCE, expiresIn: "1h" });
    const wrongAudience = await signedToken({ role: "admin", audience: "autre-application", expiresIn: "1h" });

    await expect(verifySessionToken(expired)).resolves.toBeNull();
    await expect(verifySessionToken(wrongRole)).resolves.toBeNull();
    await expect(verifySessionToken(wrongAudience)).resolves.toBeNull();
  });
});

async function signedToken(input: {
  role: string;
  audience: string;
  expiresIn: string;
}): Promise<string> {
  return new SignJWT({ email: "admin.qa@example.com", role: input.role })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject("qa-owner")
    .setIssuer(SESSION_ISSUER)
    .setAudience(input.audience)
    .setIssuedAt()
    .setExpirationTime(input.expiresIn)
    .sign(new TextEncoder().encode(TEST_SECRET));
}
