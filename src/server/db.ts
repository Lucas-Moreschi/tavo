import { Pool, type PoolClient } from "pg";

const globalDb = globalThis as unknown as { tavoPool?: Pool };
export function getPool(): Pool {
  if (!globalDb.tavoPool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("Configure DATABASE_URL antes de acessar o banco.");
    globalDb.tavoPool = new Pool({
      connectionString,
      max: Number(process.env.DB_POOL_SIZE || 5),
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000,
    });
  }
  return globalDb.tavoPool;
}
export async function transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
export async function closePool() {
  if (globalDb.tavoPool) {
    await globalDb.tavoPool.end();
    delete globalDb.tavoPool;
  }
}
