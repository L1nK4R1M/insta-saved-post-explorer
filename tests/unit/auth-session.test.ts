// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { cookiesMock } = vi.hoisted(() => ({ cookiesMock: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: cookiesMock }));

import { SESSION_COOKIE_NAME, SESSION_DURATION_SECONDS } from "@/auth/constants";
import {
  getSession,
  getSessionCookieOptions,
  requireSession,
  UnauthorizedError,
} from "@/auth/session";
import { createSessionToken } from "@/auth/token";

const TEST_SECRET = "qa-only-secret-material-32-bytes-minimum";
const SYNTACTIC_BCRYPT_HASH = `$2b$12$${"A".repeat(53)}`;

describe("session et cookie", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "test");
    process.env.AUTH_SECRET = TEST_SECRET;
    process.env.ADMIN_PASSWORD_HASH = SYNTACTIC_BCRYPT_HASH;
    process.env.APP_OWNER_ID = "qa-owner";
    process.env.AUTH_DISABLED = "false";
    cookiesMock.mockReset();
    cookiesMock.mockResolvedValue({ get: vi.fn(() => undefined) });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("pose un cookie HttpOnly, SameSite=Lax, borné à une heure", () => {
    expect(getSessionCookieOptions()).toEqual({
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      path: "/",
      maxAge: SESSION_DURATION_SECONDS,
    });

    vi.stubEnv("NODE_ENV", "production");
    expect(getSessionCookieOptions().secure).toBe(true);
  });

  it("retourne la session portée par le cookie attendu", async () => {
    const token = await createSessionToken();
    cookiesMock.mockResolvedValue({
      get: vi.fn((name: string) => name === SESSION_COOKIE_NAME ? { value: token } : undefined),
    });

    await expect(getSession()).resolves.toMatchObject({
      ownerId: "qa-owner",
      role: "admin",
      bypass: false,
    });
  });

  it("échoue fermé lorsque le cookie est absent", async () => {
    await expect(getSession()).resolves.toBeNull();
    await expect(requireSession()).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("n'utilise le bypass que dans un environnement hors production", async () => {
    vi.stubEnv("NODE_ENV", "development");
    process.env.AUTH_DISABLED = "true";

    await expect(getSession()).resolves.toEqual({
      ownerId: "qa-owner",
      role: "admin",
      bypass: true,
    });
    expect(cookiesMock).not.toHaveBeenCalled();
  });
});
