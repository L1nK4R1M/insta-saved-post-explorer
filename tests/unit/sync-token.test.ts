// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createSyncToken, verifySyncToken } from "@/auth/sync-token";

const TEST_SECRET = "qa-only-secret-material-32-bytes-minimum";
const SYNTACTIC_BCRYPT_HASH = `$2b$12$${"A".repeat(53)}`;

describe("jetons de synchronisation Instagram", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "test");
    process.env.AUTH_SECRET = TEST_SECRET;
    process.env.ADMIN_PASSWORD_HASH = SYNTACTIC_BCRYPT_HASH;
    process.env.APP_OWNER_ID = "qa-owner";
  });

  afterEach(() => vi.unstubAllEnvs());

  it("lie le jeton au job et au propriétaire", async () => {
    const token = await createSyncToken("sync-job-1", "qa-owner");
    await expect(verifySyncToken(token)).resolves.toMatchObject({
      sub: "sync-job-1",
      ownerId: "qa-owner",
      scope: "instagram-sync",
    });
  });

  it("refuse un jeton altéré", async () => {
    const token = await createSyncToken("sync-job-1", "qa-owner");
    await expect(verifySyncToken(`${token}x`)).rejects.toThrow();
  });
});
