import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { closePool, transaction } from "../../src/server/db";

try {
  process.loadEnvFile();
} catch {
  /* Variables may be supplied by Docker or hosting. */
}
async function migrate() {
  await transaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(714026401)");
    await client.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
    );
    const directory = path.join(process.cwd(), "database", "migrations");
    for (const name of (await readdir(directory)).filter((name) => name.endsWith(".sql")).sort()) {
      const applied = await client.query("SELECT 1 FROM schema_migrations WHERE name=$1", [name]);
      if (applied.rowCount) continue;
      await client.query(await readFile(path.join(directory, name), "utf8"));
      await client.query("INSERT INTO schema_migrations(name) VALUES($1)", [name]);
      console.log(`Migração aplicada: ${name}`);
    }
  });
}
migrate()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(closePool);
