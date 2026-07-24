// @vitest-environment node

import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

// Minimal environment for which the preflight passes when Places is disabled.
const BASE_ENV: Record<string, string> = {
  DATABASE_URL: "postgresql://neon:secretpw@db.neon.tech:5432/appdb?sslmode=require",
  AUTH_SECRET: "aGVsbG9zZWNyZXRhdXRoc2VjcmV0MTIzNDU2Nzg5MHF3",
  ADMIN_PASSWORD_HASH: "$2b$10$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1",
  APP_OWNER_ID: "local",
};

function runPreflight(extraEnv: Record<string, string> = {}): { status: number | null; output: string } {
  const env = { PATH: process.env.PATH ?? "", ...BASE_ENV, ...extraEnv } as unknown as NodeJS.ProcessEnv;
  const result = spawnSync(process.execPath, ["scripts/vercel-preflight.mjs"], { env, encoding: "utf8" });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

describe("vercel-preflight Places checks", () => {
  it("passes when Places is disabled and no Geoapify key is present", () => {
    expect(runPreflight().status).toBe(0);
  });

  it("fails when Places is enabled without a Geoapify key", () => {
    const { status, output } = runPreflight({ PLACES_ENABLED: "1" });
    expect(status).toBe(1);
    expect(output).toContain("GEOAPIFY_API_KEY");
  });

  it("passes when Places is enabled with a valid Geoapify configuration", () => {
    const { status } = runPreflight({
      PLACES_ENABLED: "1",
      GEOAPIFY_API_KEY: "a-valid-key",
      PLACES_RESOLVER_PROVIDER: "geoapify",
      GEOAPIFY_API_BASE_URL: "https://api.geoapify.com",
      PLACES_RESOLVER_TIMEOUT_MS: "8000",
      PLACES_RESOLVER_MAX_RESULTS: "5",
    });
    expect(status).toBe(0);
  });

  it("rejects out-of-range resolver bounds and a non-HTTPS base URL", () => {
    const { status, output } = runPreflight({
      PLACES_ENABLED: "1",
      GEOAPIFY_API_KEY: "a-valid-key",
      GEOAPIFY_API_BASE_URL: "http://insecure.example",
      PLACES_RESOLVER_MAX_RESULTS: "9",
    });
    expect(status).toBe(1);
    expect(output).toContain("GEOAPIFY_API_BASE_URL");
    expect(output).toContain("PLACES_RESOLVER_MAX_RESULTS");
  });

  it("never prints the Geoapify key even on failure", () => {
    const { status, output } = runPreflight({
      PLACES_ENABLED: "1",
      GEOAPIFY_API_KEY: "SUPER-SECRET-GEOAPIFY-KEY",
      GEOAPIFY_API_BASE_URL: "http://insecure.example",
    });
    expect(status).toBe(1);
    expect(output).not.toContain("SUPER-SECRET-GEOAPIFY-KEY");
  });

  it("never prints the full DATABASE_URL", () => {
    const { output } = runPreflight({ PLACES_ENABLED: "1", GEOAPIFY_API_KEY: "a-valid-key" });
    expect(output).not.toContain("secretpw");
  });
});
