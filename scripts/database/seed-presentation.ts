import { seedConfiguration } from "./seed-config";
import { createHash } from "node:crypto";
import { closePool, transaction } from "../../src/server/db";
import { loadState, saveState } from "../../src/server/repository";
import type { Role } from "../../src/domain/types";
import {
  PRESENTATION_OPERATION,
  populatePresentation,
  type PresentationActors,
} from "./presentation-scenarios";

try {
  process.loadEnvFile();
} catch {
  /* O Docker pode injetar as variáveis. */
}

async function seedPresentation() {
  seedConfiguration();
  const outcome = await transaction(async (client) => {
    const target = await client.query("SELECT id FROM restaurants WHERE slug=$1 FOR UPDATE", [
      "tavo-demo",
    ]);
    if (!target.rowCount)
      throw new Error("TAVO Restaurante não encontrado. Execute primeiro npm run db:seed.");
    const restaurantId = target.rows[0].id as string;
    const prior = await client.query(
      "SELECT result FROM operation_results WHERE restaurant_id=$1 AND operation_id=$2",
      [restaurantId, PRESENTATION_OPERATION],
    );
    if (prior.rowCount) return { replayed: true, result: prior.rows[0].result };
    const rows = await client.query(
      `SELECT m.id AS "memberId",m.user_id AS "userId",m.restaurant_id AS "restaurantId",m.role,u.name
      FROM memberships m JOIN "user" u ON u.id=m.user_id WHERE m.restaurant_id=$1 AND m.active AND u.email=m.role||'@tavo.demo'`,
      [restaurantId],
    );
    const actors = Object.fromEntries(
      rows.rows.map((actor) => [actor.role, actor]),
    ) as PresentationActors;
    for (const role of ["gestor", "garcom", "caixa", "cozinha", "bar"] as Role[])
      if (!actors[role])
        throw new Error(
          `O perfil demonstrativo ${role}@tavo.demo precisa estar ativo. Nenhuma senha foi alterada.`,
        );
    const loaded = await loadState(client, restaurantId);
    const previous = structuredClone(loaded.state);
    const summary = populatePresentation(loaded.state, actors);
    await saveState(client, loaded.state, previous);
    await client.query("UPDATE restaurants SET version=version+1 WHERE id=$1", [restaurantId]);
    const result = { message: "Cenário de demonstração carregado", summary };
    await client.query(
      "INSERT INTO operation_results(restaurant_id,operation_id,user_id,payload_hash,result) VALUES($1,$2,$3,$4,$5::jsonb)",
      [
        restaurantId,
        PRESENTATION_OPERATION,
        actors.gestor.userId,
        createHash("sha256").update(PRESENTATION_OPERATION).digest("hex"),
        JSON.stringify(result),
      ],
    );
    return { replayed: false, result };
  });
  console.log(
    outcome.replayed
      ? "A demonstração já foi carregada. Nenhum dado foi duplicado ou restaurado."
      : "Demonstração carregada no TAVO Restaurante. Registros anteriores e outros restaurantes preservados.",
  );
  console.log(JSON.stringify(outcome.result.summary, null, 2));
  console.log("Abra http://localhost:3000 e atualize a página. Roteiro: docs/SEED.md");
}

seedPresentation()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(closePool);
