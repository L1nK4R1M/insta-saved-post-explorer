import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  AuthConfigurationError,
  getAdminCredentials,
  getAuthConfigurationStatus,
  getConfiguredOwnerId,
  getSessionConfiguration,
  isAuthDisabled,
  isUnsafeProductionBypassRequested,
} from "@/auth/config";

const ENV_KEYS = [
  "AUTH_DISABLED",
  "AUTH_SECRET",
  "ADMIN_EMAIL",
  "ADMIN_PASSWORD_HASH",
  "APP_OWNER_ID",
] as const;

const TEST_SECRET = "qa-only-secret-material-32-bytes-minimum";
const SYNTACTIC_BCRYPT_HASH = `$2b$12$${"A".repeat(53)}`;

describe("configuration d'authentification", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "test");
    for (const key of ENV_KEYS) delete process.env[key];
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("normalise l'e-mail et expose une configuration de session bornée", () => {
    configureValidEnvironment();
    process.env.ADMIN_EMAIL = "  Admin.QA@Example.COM ";

    const configuration = getSessionConfiguration();

    expect(configuration.adminEmail).toBe("admin.qa@example.com");
    expect(configuration.ownerId).toBe("qa_owner-1");
    expect(new TextDecoder().decode(configuration.secret)).toBe(TEST_SECRET);
  });

  it("refuse toute configuration incomplète ou mal formée", () => {
    configureValidEnvironment();
    const cases: Array<[keyof NodeJS.ProcessEnv, string | undefined]> = [
      ["AUTH_SECRET", "trop-court"],
      ["ADMIN_EMAIL", "pas-un-email"],
      ["ADMIN_PASSWORD_HASH", "$2b$04$invalide"],
      ["APP_OWNER_ID", "owner avec espaces"],
      ["AUTH_SECRET", undefined],
    ];

    for (const [key, invalidValue] of cases) {
      configureValidEnvironment();
      if (invalidValue === undefined) delete process.env[key];
      else process.env[key] = invalidValue;
      expect(() => getAdminCredentials(), String(key)).toThrow(AuthConfigurationError);
    }
  });

  it("n'active le bypass explicite qu'en dehors de la production", () => {
    process.env.AUTH_DISABLED = "true";

    vi.stubEnv("NODE_ENV", "development");
    expect(isAuthDisabled()).toBe(true);
    expect(isUnsafeProductionBypassRequested()).toBe(false);
    expect(getAuthConfigurationStatus()).toBe("disabled");

    vi.stubEnv("NODE_ENV", "production");
    expect(isAuthDisabled()).toBe(false);
    expect(isUnsafeProductionBypassRequested()).toBe(true);
    expect(() => getSessionConfiguration()).toThrow(AuthConfigurationError);
    expect(getAuthConfigurationStatus()).toBe("missing");
  });

  it("utilise local par défaut et refuse un ownerId non sûr", () => {
    expect(getConfiguredOwnerId()).toBe("local");

    process.env.APP_OWNER_ID = "../../autre-utilisateur";
    expect(() => getConfiguredOwnerId()).toThrow(AuthConfigurationError);
  });
});

function configureValidEnvironment(): void {
  process.env.AUTH_SECRET = TEST_SECRET;
  process.env.ADMIN_EMAIL = "admin.qa@example.com";
  process.env.ADMIN_PASSWORD_HASH = SYNTACTIC_BCRYPT_HASH;
  process.env.APP_OWNER_ID = "qa_owner-1";
  process.env.AUTH_DISABLED = "false";
}
