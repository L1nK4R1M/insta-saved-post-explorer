import { Pool } from "pg";

export function createDatabasePool(databaseUrl: string, workerId: string): Pool {
  return new Pool({
    connectionString: databaseUrl,
    application_name: `ipe-worker:${workerId}`,
    max: 4,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
}
