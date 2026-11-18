import { readdir, readFile } from "node:fs/promises";
import pg from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("Configure DATABASE_URL para executar a entrega SQL.");

const migrations = new URL("../../database/migrations/", import.meta.url);
const delivery = new URL("../../database/entrega/", import.meta.url);
const client = new pg.Client({ connectionString, connectionTimeoutMillis: 10_000 });

await client.connect();
try {
  await client.query("BEGIN");
  await client.query("CREATE SCHEMA tavo_entrega");
  await client.query("SET LOCAL search_path TO tavo_entrega");

  for (const name of (await readdir(migrations)).filter((file) => file.endsWith(".sql")).sort()) {
    await client.query(await readFile(new URL(name, migrations), "utf8"));
  }

  await client.query(await readFile(new URL("dados.sql", delivery), "utf8"));
  await client.query("SET CONSTRAINTS ALL IMMEDIATE");
  const results = await client.query(await readFile(new URL("consultas.sql", delivery), "utf8"));
  for (const { rows } of results) console.table(rows);

  await client.query("ROLLBACK");
  console.log("Demonstração SQL concluída. Transação revertida.");
} finally {
  await client.end();
}
