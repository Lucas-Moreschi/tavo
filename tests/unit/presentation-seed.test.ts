import test from "node:test";
import assert from "node:assert/strict";
import {
  populatePresentation,
  type PresentationActors,
} from "../../scripts/database/presentation-scenarios";
import { emptyState } from "../../src/server/repository";
import { applyCommand } from "../../src/domain/commands";
import { cashExpected, tabTotals } from "../../src/domain/finance";
import type { CommandContext, Role } from "../../src/domain/types";

function fixture() {
  let sequence = 0;
  const id = () => `demo-${++sequence}`;
  const now = new Date("2026-11-11T18:00:00Z");
  const state = emptyState({
    id: "restaurant",
    slug: "tavo-demo",
    name: "TAVO Restaurante",
    plan: "demonstracao",
    timezone: "America/Sao_Paulo",
    serviceRateBps: 1000,
    reservationMinutes: 90,
    deliveryFeeCents: 500,
    address: "",
    phone: "",
    createdAt: now.toISOString(),
  });
  const actors = Object.fromEntries(
    (["gestor", "garcom", "caixa", "cozinha", "bar"] as Role[]).map((role) => [
      role,
      {
        userId: `${role}-user`,
        memberId: `${role}-member`,
        restaurantId: state.restaurant.id,
        role,
        name: role,
      },
    ]),
  ) as PresentationActors;
  const ctx: CommandContext = { actor: actors.gestor, now: now.toISOString(), id };
  const run = (action: string, payload: Record<string, unknown>) =>
    applyCommand(state, { action, payload, operationId: id() }, ctx).entityId!;
  for (let number = 1; number <= 8; number++)
    run("table.save", { number, capacity: 6, sector: "Salão", active: true });
  const categoryId = run("category.save", { name: "Pratos", active: true });
  const stockItemId = run("stock.save", {
    name: "Insumo base",
    unit: "un",
    minimumMilli: 1000,
    active: true,
  });
  run("stock.entry", {
    stockItemId,
    quantityMilli: 1_000_000,
    costCents: 100000,
    reason: "Entrada base",
  });
  for (const [name, station, priceCents] of [
    ["Burger da casa", "cozinha", 3800],
    ["Risoto de cogumelos", "cozinha", 4600],
    ["Spritz da casa", "bar", 3200],
    ["Água mineral", "direto", 600],
    ["Petit gâteau", "cozinha", 2700],
  ] as const) {
    run("product.save", {
      name,
      station,
      priceCents,
      categoryId,
      active: true,
      recipe: [{ stockItemId, quantityMilli: 1000 }],
      options:
        name === "Burger da casa"
          ? [
              { name: "Cheddar extra", priceCents: 400, recipe: [] },
              { name: "Sem queijo", priceCents: 0, recipe: [] },
            ]
          : [],
    });
  }
  return { state, actors, now, id, run };
}

test("demo mantém contas fechadas conciliadas e reservas de estoque iguais ao que falta iniciar", () => {
  const { state, actors, now, id } = fixture();
  const existingIds = state.products.map((product) => product.id);
  const summary = populatePresentation(state, actors, now, id);
  assert.deepEqual(
    state.products.slice(0, existingIds.length).map((product) => product.id),
    existingIds,
  );
  for (const tab of state.tabs.filter((entry) => entry.status === "fechada")) {
    assert.equal(tabTotals(state, tab.id).balanceCents, 0);
    assert.ok(
      state.items
        .filter((item) => item.tabId === tab.id && item.status !== "cancelado")
        .every((item) => item.status === "entregue"),
    );
  }
  for (const stock of state.stockItems) {
    const required = state.items
      .filter((item) => !["rascunho", "cancelado"].includes(item.status))
      .reduce(
        (total, item) =>
          total +
          item.recipe
            .filter((line) => line.stockItemId === stock.id)
            .reduce(
              (sum, line) =>
                sum + line.quantityMilli * (item.quantity - (item.startedQuantity ?? 0)),
              0,
            ),
        0,
      );
    assert.equal(stock.reservedMilli, required, stock.name);
    assert.ok(stock.quantityMilli >= stock.reservedMilli, stock.name);
  }
  for (const cash of state.cashSessions.filter((entry) => entry.closedAt))
    assert.equal(cash.countedCents, cashExpected(state, cash.id));
  assert.equal(state.cashSessions.filter((cash) => !cash.closedAt).length, 1);
  assert.equal(summary.expectedCashCents, 49300);
  assert.ok(state.refunds.some((refund) => refund.amountCents === 500));
  assert.ok(
    state.stockItems.some(
      (stock) => stock.quantityMilli - stock.reservedMilli < stock.minimumMilli,
    ),
  );
});

test("cenário de grupo pode ser separado mantendo pagamentos e cada atendimento de origem", () => {
  const { state, actors, now, id } = fixture();
  const summary = populatePresentation(state, actors, now, id);
  const payments = structuredClone(state.payments);
  const grouped = state.visits
    .filter((visit) => visit.groupId === summary.groupId)
    .map((visit) => visit.id);
  assert.equal(grouped.length, 2);
  assert.ok(state.items.some((item) => item.quantity === 3 && item.deliveredQuantity === 1));
  applyCommand(
    state,
    { action: "group.split", payload: { groupId: summary.groupId }, operationId: id() },
    { actor: actors.garcom, now: now.toISOString(), id },
  );
  assert.deepEqual(state.payments, payments);
  assert.ok(
    state.visits
      .filter((visit) => grouped.includes(visit.id))
      .every((visit) => visit.groupId === null && visit.closedAt === null),
  );
});

test("carga rejeita outro restaurante e caixa existente antes de qualquer alteração", () => {
  const { state, actors, now, id, run } = fixture();
  state.restaurant.slug = "outro-restaurante";
  const previous = structuredClone(state);
  assert.throws(() => populatePresentation(state, actors, now, id), /exclusiva/);
  assert.deepEqual(state, previous);
  state.restaurant.slug = "tavo-demo";
  run("cash.open", { openingCents: 0 });
  const withCash = structuredClone(state);
  assert.throws(() => populatePresentation(state, actors, now, id), /caixa aberto/);
  assert.deepEqual(state, withCash);
});
