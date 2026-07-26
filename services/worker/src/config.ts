import os from "node:os";
import path from "node:path";
import { isIP } from "node:net";

import { z } from "zod";

export type WorkerConfig = {
  databaseUrl: string;
  ownerId: string;
  workerId: string;
  pollIntervalMs: number;
  leaseDurationMs: number;
  heartbeatIntervalMs: number;
  maxAttempts: number;
  tempRoot: string;
  logLevel: "debug" | "info" | "warn" | "error";
  healthHost: string;
  healthPort: number;
  r2: {
    accountId: string;
    bucket: string;
    accessKeyId: string;
    secretAccessKey: string;
    maxBytes: number;
  };
  shutdownTimeoutMs: number;
  janitorMaxAgeMs: number;
};

const safeIdentifier = z.string().min(1).max(128).regex(/^[A-Za-z0-9._:-]+$/);
const safeSegment = z.string().min(1).max(255).regex(/^[A-Za-z0-9._-]+$/);

function integerEnv(defaultValue: number, minimum: number, maximum: number) {
  return z.preprocess(
    (value) => (value === undefined || value === "" ? defaultValue : Number(value)),
    z.number().int().finite().min(minimum).max(maximum),
  );
}

const environmentSchema = z
  .object({
    databaseUrl: z.string().url().refine((value) => /^postgres(?:ql)?:\/\//.test(value)),
    ownerId: safeIdentifier,
    workerId: safeIdentifier,
    pollIntervalMs: integerEnv(5_000, 100, 300_000),
    leaseDurationMs: integerEnv(90_000, 1_000, 86_400_000),
    heartbeatIntervalMs: integerEnv(30_000, 100, 86_400_000),
    maxAttempts: integerEnv(3, 1, 20),
    tempRoot: z
      .string()
      .min(1)
      .transform((value) => path.resolve(value))
      .refine((value) => path.isAbsolute(value) && value !== path.parse(value).root),
    logLevel: z.enum(["debug", "info", "warn", "error"]).default("info"),
    healthHost: z
      .string()
      .default("127.0.0.1")
      .refine((value) => isIP(value) !== 0)
      .refine((value) => value === "::1" || value.startsWith("127.")),
    healthPort: integerEnv(8_080, 1, 65_535),
    r2AccountId: safeSegment,
    r2Bucket: safeSegment,
    r2AccessKeyId: z.string().min(1),
    r2SecretAccessKey: z.string().min(1),
    r2MaxBytes: integerEnv(536_870_912, 1_048_576, 2_147_483_648),
    shutdownTimeoutMs: integerEnv(30_000, 1_000, 300_000),
    janitorMaxAgeMs: integerEnv(21_600_000, 1_000, 604_800_000),
  })
  .superRefine((value, context) => {
    if (value.heartbeatIntervalMs > value.leaseDurationMs / 3) {
      context.addIssue({ code: "custom", path: ["heartbeatIntervalMs"], message: "invalid relation" });
    }
    if (value.janitorMaxAgeMs < value.leaseDurationMs) {
      context.addIssue({ code: "custom", path: ["janitorMaxAgeMs"], message: "invalid relation" });
    }
  });

export function parseWorkerConfig(env: NodeJS.ProcessEnv): WorkerConfig {
  const parsed = environmentSchema.safeParse({
    databaseUrl: env.WORKER_DATABASE_URL || env.DATABASE_URL,
    ownerId: env.WORKER_OWNER_ID,
    workerId: env.WORKER_ID || os.hostname(),
    pollIntervalMs: env.WORKER_POLL_INTERVAL_MS,
    leaseDurationMs: env.WORKER_LEASE_DURATION_MS,
    heartbeatIntervalMs: env.WORKER_HEARTBEAT_INTERVAL_MS,
    maxAttempts: env.WORKER_MAX_ATTEMPTS,
    tempRoot: env.WORKER_TEMP_ROOT,
    logLevel: env.WORKER_LOG_LEVEL,
    healthHost: env.WORKER_HEALTH_HOST,
    healthPort: env.WORKER_HEALTH_PORT,
    r2AccountId: env.R2_ACCOUNT_ID,
    r2Bucket: env.R2_BUCKET_NAME,
    r2AccessKeyId: env.R2_ACCESS_KEY_ID,
    r2SecretAccessKey: env.R2_SECRET_ACCESS_KEY,
    r2MaxBytes: env.WORKER_R2_MAX_BYTES,
    shutdownTimeoutMs: env.WORKER_SHUTDOWN_TIMEOUT_MS,
    janitorMaxAgeMs: env.WORKER_JANITOR_MAX_AGE_MS,
  });

  if (!parsed.success) {
    const fields = [...new Set(parsed.error.issues.map((issue) => issue.path.join(".")))].sort();
    throw new Error(`WORKER_CONFIG_INVALID:${fields.join(",")}`);
  }

  return {
    databaseUrl: parsed.data.databaseUrl,
    ownerId: parsed.data.ownerId,
    workerId: parsed.data.workerId,
    pollIntervalMs: parsed.data.pollIntervalMs,
    leaseDurationMs: parsed.data.leaseDurationMs,
    heartbeatIntervalMs: parsed.data.heartbeatIntervalMs,
    maxAttempts: parsed.data.maxAttempts,
    tempRoot: parsed.data.tempRoot,
    logLevel: parsed.data.logLevel,
    healthHost: parsed.data.healthHost,
    healthPort: parsed.data.healthPort,
    r2: {
      accountId: parsed.data.r2AccountId,
      bucket: parsed.data.r2Bucket,
      accessKeyId: parsed.data.r2AccessKeyId,
      secretAccessKey: parsed.data.r2SecretAccessKey,
      maxBytes: parsed.data.r2MaxBytes,
    },
    shutdownTimeoutMs: parsed.data.shutdownTimeoutMs,
    janitorMaxAgeMs: parsed.data.janitorMaxAgeMs,
  };
}
