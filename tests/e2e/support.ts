import { test as base, expect, type APIRequestContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
import type { AppSnapshot, Role } from "../../src/domain/types";
import { collections } from "../../src/server/repository";
import { closePool, transaction } from "../../src/server/db";

try {
  process.loadEnvFile();
} catch {
  /* CI supplies environment variables. */
}
export { expect };
export const origin = new URL(process.env.TEST_BASE_URL || "http://localhost:3000").origin;

export async function readState(request: APIRequestContext): Promise<AppSnapshot> {
  const response = await request.get("/api/state");
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}

export async function command(
  request: APIRequestContext,
  action: string,
  payload: Record<string, unknown>,
  operationId = randomUUID(),
) {
  const before = await readState(request);
  const response = await request.post("/api/commands", {
    headers: { Origin: origin },
    data: { action, payload, operationId, expectedVersion: before.version },
  });
  expect(response.ok(), `${action}: ${await response.text()}`).toBeTruthy();
  return response.json() as Promise<{
    snapshot: AppSnapshot;
    result: { entityId: string };
    replayed: boolean;
  }>;
}

type Credentials = { name: string; email: string; password: string };
interface Accounts {
  create: (
    request: APIRequestContext,
    settings?: { serviceRateBps?: number; deliveryFeeCents?: number },
  ) => Promise<Credentials & { snapshot: AppSnapshot }>;
  addStaff: (manager: APIRequestContext, role: Role) => Promise<Credentials>;
}

export const test = base.extend<{ accounts: Accounts }>({
  accounts: async ({}, use) => {
    if (!process.env.DATABASE_URL)
      throw new Error(
        "Configure DATABASE_URL para os dados isolados e a limpeza dos testes de navegador.",
      );
    const tenants: string[] = [],
      emails: string[] = [];
    const accounts: Accounts = {
      create: async (request, settings = {}) => {
        const suffix = randomUUID().slice(0, 8);
        const credentials = {
          name: "Gestor de teste",
          email: `qa-${suffix}@tavo.test`,
          password: `TavoQA-${randomUUID()}!`,
        };
        const response = await request.post("/api/account/onboard", {
          headers: {
            Origin: origin,
            "x-forwarded-for": `198.51.100.${1 + Math.floor(Math.random() * 253)}`,
          },
          data: {
            ...credentials,
            restaurantName: `Restaurante QA ${suffix}`,
            slug: `qa-${suffix}`,
            plan: "completo",
            serviceRateBps: 1000,
            reservationMinutes: 90,
            deliveryFeeCents: 500,
            ...settings,
          },
        });
        expect(response.status(), await response.text()).toBe(201);
        tenants.push((await response.json()).restaurantId);
        emails.push(credentials.email);
        return { ...credentials, snapshot: await readState(request) };
      },
      addStaff: async (request, role) => {
        const credentials = {
          name: `Pessoa de teste ${role}`,
          email: `qa-${role}-${randomUUID()}@tavo.test`,
          password: `TavoQA-${randomUUID()}!`,
        };
        const response = await request.post("/api/account/team", {
          headers: { Origin: origin },
          data: { ...credentials, role, active: true },
        });
        expect(response.ok(), await response.text()).toBeTruthy();
        emails.push(credentials.email);
        return credentials;
      },
    };
    try {
      await use(accounts);
    } finally {
      try {
        await transaction(async (client) => {
          await client.query("SET CONSTRAINTS ALL DEFERRED");
          for (const table of [
            "uploaded_files",
            "recipe_components",
            "item_recipe_components",
            "payment_allocations",
            "refund_allocations",
            "reservation_tables",
            "operation_results",
            "invitations",
            ...Object.values(collections),
            "memberships",
          ]) {
            await client.query(`DELETE FROM ${table} WHERE restaurant_id=ANY($1::text[])`, [
              tenants,
            ]);
          }
          await client.query(
            "DELETE FROM restaurants WHERE id=ANY($1::text[]) AND slug LIKE 'qa-%'",
            [tenants],
          );
          await client.query('DELETE FROM "user" WHERE email=ANY($1::text[])', [emails]);
          await client.query("DELETE FROM mail_outbox WHERE recipient=ANY($1::text[])", [emails]);
        });
      } finally {
        await closePool();
      }
    }
  },
});

export async function loginStaff(request: APIRequestContext, credentials: Credentials) {
  const response = await request.post("/api/auth/sign-in/email", {
    headers: { Origin: origin },
    data: { email: credentials.email, password: credentials.password },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  const changed = await request.post("/api/account/profile", {
    headers: { Origin: origin },
    data: {
      name: credentials.name,
      currentPassword: credentials.password,
      newPassword: `${credentials.password}New`,
    },
  });
  expect(changed.ok(), await changed.text()).toBeTruthy();
}

export async function serviceFixtures(request: APIRequestContext) {
  const tableId = (
    await command(request, "table.save", { number: 1, capacity: 4, sector: "Salão", active: true })
  ).result.entityId;
  const categoryId = (await command(request, "category.save", { name: "Pratos", active: true }))
    .result.entityId;
  const stockId = (
    await command(request, "stock.save", {
      name: "Ingrediente de teste",
      unit: "g",
      minimumMilli: 1000,
      active: true,
    })
  ).result.entityId;
  await command(request, "stock.entry", {
    stockItemId: stockId,
    quantityMilli: 1000000,
    costCents: 5000,
    reason: "Entrada do teste",
  });
  const product = await command(request, "product.save", {
    categoryId,
    name: "Prato de teste",
    description: "Receita de teste",
    priceCents: 3800,
    station: "cozinha",
    active: true,
    recipe: [{ stockItemId: stockId, quantityMilli: 100000 }],
    options: [{ name: "Adicional de teste", priceCents: 400, recipe: [] }],
  });
  return {
    tableId,
    productId: product.result.entityId,
    optionId: product.snapshot.products.find((entry) => entry.id === product.result.entityId)!
      .options[0].id,
  };
}
