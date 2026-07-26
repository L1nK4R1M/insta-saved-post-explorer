import { Pool, type PoolClient } from "pg";

export function createDatabasePool(databaseUrl: string, workerId: string): Pool {
  return new Pool({
    connectionString: databaseUrl,
    application_name: `ipe-worker:${workerId}`,
    max: 4,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
}

export async function withTransaction<T>(
  pool: Pick<Pool, "connect">,
  operation: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
