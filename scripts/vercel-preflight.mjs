const errors = [];
const warnings = [];

const required = [
  "DATABASE_URL",
  "AUTH_SECRET",
  "ADMIN_EMAIL",
  "ADMIN_PASSWORD_HASH",
  "APP_OWNER_ID",
];

for (const name of required) {
  if (!process.env[name]?.trim()) errors.push(`${name} is required.`);
}

if (process.env.AUTH_DISABLED === "true") {
  errors.push("AUTH_DISABLED=true is forbidden for a Vercel deployment.");
}

const databaseUrl = process.env.DATABASE_URL?.trim();
if (databaseUrl) {
  try {
    const parsed = new URL(databaseUrl);
    if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
      errors.push("DATABASE_URL must use the postgres or postgresql protocol.");
    }
    if (!parsed.hostname || !parsed.pathname || parsed.pathname === "/") {
      errors.push("DATABASE_URL must include a host and database name.");
    }
  } catch {
    errors.push("DATABASE_URL is not a valid URL.");
  }
  if (/\b(USER|PASSWORD|HOST|DATABASE)\b/i.test(databaseUrl)) {
    errors.push("DATABASE_URL still contains placeholder values.");
  }
}

const authSecret = process.env.AUTH_SECRET ?? "";
if (authSecret && authSecret.length < 32) {
  errors.push("AUTH_SECRET must contain at least 32 characters.");
}
if (/generate|replace|example|change-me/i.test(authSecret)) {
  errors.push("AUTH_SECRET appears to be a placeholder.");
}

const adminEmail = process.env.ADMIN_EMAIL ?? "";
if (adminEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) {
  errors.push("ADMIN_EMAIL is not a valid email address.");
}
if (/example\.(com|invalid)$/i.test(adminEmail)) {
  errors.push("ADMIN_EMAIL appears to be a placeholder.");
}

const passwordHash = process.env.ADMIN_PASSWORD_HASH ?? "";
if (passwordHash && !/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(passwordHash)) {
  errors.push("ADMIN_PASSWORD_HASH must be a valid bcrypt hash.");
}

const ownerId = process.env.APP_OWNER_ID ?? "";
if (ownerId && !/^[A-Za-z0-9_-]{1,128}$/.test(ownerId)) {
  errors.push("APP_OWNER_ID must contain only letters, digits, underscores, or hyphens.");
}

const importLimit = Number(process.env.IMPORT_MAX_BYTES ?? "1000000");
if (!Number.isInteger(importLimit) || importLimit < 1024 || importLimit > 1_000_000) {
  errors.push("IMPORT_MAX_BYTES must be an integer between 1024 and 1000000.");
}

const publicUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
if (publicUrl) {
  try {
    const parsed = new URL(publicUrl);
    if (process.env.VERCEL_ENV === "production" && parsed.protocol !== "https:") {
      errors.push("NEXT_PUBLIC_APP_URL must use HTTPS in production.");
    }
  } catch {
    errors.push("NEXT_PUBLIC_APP_URL is not a valid URL.");
  }
} else {
  warnings.push("NEXT_PUBLIC_APP_URL is not set; Vercel aliases will still work.");
}

if (process.env.DATABASE_DIRECT_URL) {
  warnings.push("DATABASE_DIRECT_URL is not required by the Vercel runtime; keep it in GitHub Environments only.");
}

for (const warning of warnings) console.warn(`[vercel-preflight] warning: ${warning}`);

if (errors.length > 0) {
  for (const error of errors) console.error(`[vercel-preflight] error: ${error}`);
  process.exitCode = 1;
} else {
  console.log(`[vercel-preflight] ready (${process.env.VERCEL_ENV ?? "local"}).`);
}
