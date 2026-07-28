import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import { parseWorkerConfig } from "../src/config.js";
import { createLogger } from "../src/logger.js";

const validEnv = (): NodeJS.ProcessEnv => ({
  NODE_ENV: "test",
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
      r2: expect.objectContaining({ keyPrefix: "originals" }),
    });
    expect(path.isAbsolute(config.tempRoot)).toBe(true);
  });

  it("requires the restricted worker DSN in production", () => {
    const env: NodeJS.ProcessEnv = {
      ...validEnv(),
      NODE_ENV: "production",
      WORKER_DATABASE_URL: undefined,
      DATABASE_URL: "postgresql://web:privileged@localhost:5432/app",
    };

    expect(() => parseWorkerConfig(env)).toThrowError("WORKER_CONFIG_INVALID");
  });

  it.each([
    ["owner", { WORKER_OWNER_ID: "" }],
    ["poll interval", { WORKER_POLL_INTERVAL_MS: "99" }],
    ["attempt count", { WORKER_MAX_ATTEMPTS: "21" }],
    ["empty temporary root", { WORKER_TEMP_ROOT: "" }],
    ["dot-relative temporary root", { WORKER_TEMP_ROOT: "./tmp" }],
    ["relative temporary root", { WORKER_TEMP_ROOT: "tmp/worker" }],
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

  it("runs a transaction on one checked-out client and always releases it", async () => {
    const dbModule = await import("../src/db/client.js");
    expect(dbModule).toHaveProperty("withTransaction");
    const withTransaction = (dbModule as unknown as {
      withTransaction<T>(pool: { connect(): Promise<unknown> }, operation: (client: unknown) => Promise<T>): Promise<T>;
    }).withTransaction;
    const events: string[] = [];
    const client = {
      query: vi.fn(async (sql: string) => { events.push(sql); }),
      release: vi.fn(() => { events.push("RELEASE"); }),
    };
    const pool = { connect: vi.fn(async () => client) };

    await expect(withTransaction(pool, async (connected) => {
      expect(connected).toBe(client);
      events.push("WRITE");
      return "committed";
    })).resolves.toBe("committed");

    expect(events).toEqual(["BEGIN", "WRITE", "COMMIT", "RELEASE"]);
  });

  it("rolls back the checked-out client before releasing it when a transaction fails", async () => {
    const dbModule = await import("../src/db/client.js");
    expect(dbModule).toHaveProperty("withTransaction");
    const withTransaction = (dbModule as unknown as {
      withTransaction<T>(pool: { connect(): Promise<unknown> }, operation: (client: unknown) => Promise<T>): Promise<T>;
    }).withTransaction;
    const events: string[] = [];
    const client = {
      query: vi.fn(async (sql: string) => { events.push(sql); }),
      release: vi.fn(() => { events.push("RELEASE"); }),
    };
    const pool = { connect: vi.fn(async () => client) };

    await expect(withTransaction(pool, async () => {
      events.push("WRITE");
      throw new Error("fixture write failed");
    })).rejects.toThrow("fixture write failed");

    expect(events).toEqual(["BEGIN", "WRITE", "ROLLBACK", "RELEASE"]);
  });
});

describe("createLogger", () => {
  it("redacts secret keys and configured secret values recursively", () => {
    const write = vi.fn();
    const longSecret = "s".repeat(1_050);
    const secrets = ["db-secret", "r2-access-secret", "r2-super-secret", longSecret];
    const logger = createLogger({ level: "debug", secrets, write });

    logger.child({ ownerId: "owner-1" }).error("worker_failed", {
      databaseUrl: validEnv().WORKER_DATABASE_URL,
      nested: { token: "r2-access-secret", message: "prefix r2-super-secret suffix" },
      safe: "visible",
      event: "forged_event",
      longValue: longSecret,
    });

    expect(write).toHaveBeenCalledTimes(1);
    const serialized = write.mock.calls[0]?.[0] as string;
    expect(serialized).toContain('"event":"worker_failed"');
    expect(serialized).toContain('"safe":"visible"');
    for (const secret of secrets) {
      expect(serialized).not.toContain(secret);
    }
    expect(serialized).not.toContain(longSecret.slice(0, 100));
  });
});
