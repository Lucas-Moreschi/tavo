import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { insertIdentity } from "../../src/server/access";
import { closePool, transaction } from "../../src/server/db";
import { emptyState, saveState } from "../../src/server/repository";
import { applyCommand } from "../../src/domain/commands";
import type { Actor, CommandContext, Restaurant, Role } from "../../src/domain/types";

try {
  process.loadEnvFile();
} catch {
  /* Docker can inject environment variables. */
}
import { seedConfiguration } from "./seed-config";
async function seed() {
  const { password } = seedConfiguration();
  const passwordHash = await hashPassword(password);
  for (const demo of [
    { slug: "tavo-demo", name: "TAVO Restaurante", suffix: "tavo.demo" },
    { slug: "bistro-demo", name: "Bistrô Independente", suffix: "bistro.demo" },
  ]) {
    await transaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(714026402)");
      if ((await client.query("SELECT 1 FROM restaurants WHERE slug=$1", [demo.slug])).rowCount) {
        console.log(`Mantido: ${demo.name} já existe.`);
        return;
      }
      const now = new Date().toISOString();
      const restaurant: Restaurant = {
        id: randomUUID(),
        name: demo.name,
        slug: demo.slug,
        plan: "demonstracao",
        timezone: "America/Sao_Paulo",
        serviceRateBps: 1000,
        reservationMinutes: 90,
        deliveryFeeCents: 500,
        address: "Rua da Demonstração, 100",
        phone: "(11) 99999-0000",
        createdAt: now,
      };
      await client.query("INSERT INTO restaurants(id,slug,body) VALUES($1,$2,$3::jsonb)", [
        restaurant.id,
        restaurant.slug,
        JSON.stringify(restaurant),
      ]);
      let manager: Actor | undefined;
      for (const role of ["gestor", "garcom", "caixa", "cozinha", "bar"] as Role[]) {
        const email = `${role}@${demo.suffix}`;
        const name = `${{ gestor: "Marina", garcom: "Lucas", caixa: "Joana", cozinha: "Rafael", bar: "Bruna" }[role]} · ${demo.name}`;
        const existing = await client.query('SELECT id FROM "user" WHERE email=$1', [email]);
        if (existing.rowCount)
          throw new Error(
            `E-mail demonstrativo ${email} já existe fora deste restaurante. Nenhuma credencial foi alterada.`,
          );
        const userId = await insertIdentity(client, { name, email, passwordHash });
        const memberId = randomUUID();
        await client.query(
          "INSERT INTO memberships(id,restaurant_id,user_id,role) VALUES($1,$2,$3,$4)",
          [memberId, restaurant.id, userId, role],
        );
        if (role === "gestor")
          manager = { userId, memberId, restaurantId: restaurant.id, name, role };
      }
      const state = emptyState(restaurant);
      const ctx: CommandContext = { actor: manager!, now, id: randomUUID };
      const command = (action: string, payload: Record<string, unknown>) =>
        applyCommand(state, { action, payload, operationId: randomUUID() }, ctx);
      for (let number = 1; number <= 8; number++)
        command("table.save", {
          number,
          capacity: number <= 4 ? 4 : 6,
          sector: number <= 6 ? "Salão" : "Varanda",
          active: true,
        });
      const dishes = command("category.save", { name: "Pratos", active: true }).entityId!;
      const beverages = command("category.save", { name: "Bebidas", active: true }).entityId!;
      const desserts = command("category.save", { name: "Sobremesas", active: true }).entityId!;
      const stock = (
        name: string,
        unit: "g" | "ml" | "un",
        quantityMilli: number,
        costCents: number,
        minimumMilli: number,
      ) => {
        const id = command("stock.save", { name, unit, minimumMilli, active: true }).entityId!;
        command("stock.entry", {
          stockItemId: id,
          quantityMilli,
          costCents,
          reason: "Compra inicial demonstrativa",
        });
        return id;
      };
      const bread = stock("Pão brioche", "un", 100000, 20000, 10000);
      const meat = stock("Carne para hambúrguer", "g", 20000000, 80000, 2000000);
      const cheese = stock("Queijo cheddar", "g", 5000000, 18000, 500000);
      const rice = stock("Arroz arbóreo", "g", 10000000, 25000, 1000000);
      const mushrooms = stock("Cogumelos", "g", 6000000, 42000, 500000);
      const aperitif = stock("Aperitivo para spritz", "ml", 8000000, 56000, 1000000);
      const sparkling = stock("Espumante", "ml", 12000000, 48000, 1500000);
      const water = stock("Água mineral 500ml", "un", 120000, 18000, 20000);
      const cake = stock("Petit gâteau pronto", "un", 40000, 24000, 5000);
      command("product.save", {
        categoryId: dishes,
        name: "Burger da casa",
        description: "Brioche, carne e cheddar",
        priceCents: 3800,
        station: "cozinha",
        active: true,
        tag: "MAIS PEDIDO",
        recipe: [
          { stockItemId: bread, quantityMilli: 1000 },
          { stockItemId: meat, quantityMilli: 180000 },
          { stockItemId: cheese, quantityMilli: 30000 },
        ],
        options: [
          {
            name: "Sem queijo",
            priceCents: 0,
            recipe: [{ stockItemId: cheese, quantityMilli: -30000 }],
          },
          {
            name: "Cheddar extra",
            priceCents: 400,
            recipe: [{ stockItemId: cheese, quantityMilli: 20000 }],
          },
        ],
      });
      command("product.save", {
        categoryId: dishes,
        name: "Risoto de cogumelos",
        description: "Arroz arbóreo e cogumelos",
        priceCents: 4600,
        station: "cozinha",
        active: true,
        recipe: [
          { stockItemId: rice, quantityMilli: 120000 },
          { stockItemId: mushrooms, quantityMilli: 100000 },
        ],
        options: [],
      });
      command("product.save", {
        categoryId: beverages,
        name: "Spritz da casa",
        description: "Aperitivo e espumante",
        priceCents: 3200,
        station: "bar",
        active: true,
        tag: "DO BARTENDER",
        recipe: [
          { stockItemId: aperitif, quantityMilli: 60000 },
          { stockItemId: sparkling, quantityMilli: 90000 },
        ],
        options: [],
      });
      command("product.save", {
        categoryId: beverages,
        name: "Água mineral",
        description: "Garrafa de 500ml",
        priceCents: 600,
        station: "direto",
        active: true,
        recipe: [{ stockItemId: water, quantityMilli: 1000 }],
        options: [],
      });
      command("product.save", {
        categoryId: desserts,
        name: "Petit gâteau",
        description: "Chocolate meio amargo",
        priceCents: 2700,
        station: "cozinha",
        active: true,
        recipe: [{ stockItemId: cake, quantityMilli: 1000 }],
        options: [],
      });
      command("supplier.save", {
        name: "Distribuidora demonstração",
        phone: "(11) 98888-0000",
        active: true,
      });
      await saveState(client, state);
      console.log(`Criado: ${demo.name} — gestor@${demo.suffix} e demais perfis do roteiro.`);
    });
  }
  console.log("Dados demonstrativos prontos. A senha é a SEED_PASSWORD informada para esta carga.");
}
seed()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(closePool);
