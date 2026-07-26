import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import { parseWorkerConfig } from "../src/config.js";
import { createLogger } from "../src/logger.js";

const validEnv = (): NodeJS.ProcessEnv => ({
  WORKER_DATABASE_URL: "postgresql://worker:db-secret@localhost:5432/worker_test",
  WORKER_OWNER_ID: "owner-1",
  WORKER_ID: "worker-1",
  WORKER_TEMP_ROOT: path.join(process.cwd(), ".worker-test-tmp"),
  R2_ACCOUNT_ID: "account-1",
  R2_BUCKET_NAME: "media-bucket",
  R2_ACCESS_KEY_ID: "r2-access-secret",
  R2_SECRET_ACCESS_KEY: "r2-super-secret",
});

describe("parseWorkerConfig", () => {
  it("returns safe defaults and normalized paths", () => {
    const config = parseWorkerConfig(validEnv());

    expect(config).toMatchObject({
      ownerId: "owner-1",
      workerId: "worker-1",
      pollIntervalMs: 5_000,
      leaseDurationMs: 90_000,
      heartbeatIntervalMs: 30_000,
      maxAttempts: 3,
      healthHost: "127.0.0.1",
      healthPort: 8_080,
      shutdownTimeoutMs: 30_000,
      janitorMaxAgeMs: 21_600_000,
    });
    expect(path.isAbsolute(config.tempRoot)).toBe(true);
  });

  it.each([
    ["owner", { WORKER_OWNER_ID: "" }],
    ["poll interval", { WORKER_POLL_INTERVAL_MS: "99" }],
    ["attempt count", { WORKER_MAX_ATTEMPTS: "21" }],
    ["temporary root", { WORKER_TEMP_ROOT: path.parse(process.cwd()).root }],
    ["heartbeat relation", { WORKER_HEARTBEAT_INTERVAL_MS: "30001" }],
    ["health host", { WORKER_HEALTH_HOST: "0.0.0.0" }],
  ])("rejects an invalid %s without echoing its value", (_name, override) => {
    const env = { ...validEnv(), ...override };
    const invalidValue = Object.values(override)[0];

    expect(() => parseWorkerConfig(env)).toThrowError("WORKER_CONFIG_INVALID");
    try {
      parseWorkerConfig(env);
    } catch (error) {
      if (invalidValue) expect(String(error)).not.toContain(invalidValue);
    }
  });
});

describe("createLogger", () => {
  it("redacts secret keys and configured secret values recursively", () => {
    const write = vi.fn();
    const secrets = ["db-secret", "r2-access-secret", "r2-super-secret"];
    const logger = createLogger({ level: "debug", secrets, write });

    logger.child({ ownerId: "owner-1" }).error("worker_failed", {
      databaseUrl: validEnv().WORKER_DATABASE_URL,
      nested: { token: "r2-access-secret", message: "prefix r2-super-secret suffix" },
      safe: "visible",
    });

    expect(write).toHaveBeenCalledTimes(1);
    const serialized = write.mock.calls[0]?.[0] as string;
    expect(serialized).toContain('"event":"worker_failed"');
    expect(serialized).toContain('"safe":"visible"');
    for (const secret of secrets) {
      expect(serialized).not.toContain(secret);
    }
  });
});
