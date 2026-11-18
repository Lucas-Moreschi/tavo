import test from "node:test";
import assert from "node:assert/strict";
import { applyCommand } from "../../src/domain/commands";
import { AppError } from "../../src/shared/lib/errors";
import { tabTotals } from "../../src/domain/finance";
import type { CommandContext, Product, RestaurantState, Role } from "../../src/domain/types";

const NOW = "2026-11-10T19:00:00.000Z";
test("cancelamento parcial enviado cria aviso persistente só para a estação responsável", () => {
  const state = fixture(),
    ctx = context();
  const { tabId } = open(state, ctx);
  const itemId = add(state, ctx, tabId, 3);
  run(state, ctx, "order.send", { tabIds: [tabId] });
  run(state, ctx, "item.cancel", { itemId, quantity: 1, reason: "Cliente desistiu" });
  const notice = state.calls[0];
  assert.equal(notice.destination, "cozinha");
  assert.equal(notice.kind, "cancelamento");
  assert.equal(notice.quantity, 1);
  assert.equal(notice.actorName, "gestor");
  assert.equal(currentItem(state, notice.itemId!).status, "cancelado");
  assert.equal(currentItem(state, itemId).quantity, 2);
  rejected(
    () => run(state, context("bar"), "call.status", { callId: notice.id, status: "concluido" }),
    403,
  );
  run(state, context("cozinha"), "call.status", { callId: notice.id, status: "concluido" });
  assert.equal(state.calls[0].status, "concluido");
  assert.equal(currentItem(state, notice.itemId!).cancelReason, "Cliente desistiu");
});
function fixture(): RestaurantState {
  return {
    restaurant: {
      id: "restaurant",
      name: "TAVO",
      slug: "tavo",
      plan: "academico",
      timezone: "America/Sao_Paulo",
      serviceRateBps: 1000,
      reservationMinutes: 90,
      deliveryFeeCents: 800,
      address: "",
      phone: "",
      createdAt: NOW,
    },
    tables: [1, 2, 3].map((number) => ({
      id: `table${number}`,
      number,
      capacity: 4,
      sector: "Salão",
      active: true,
    })),
    visits: [],
    occupancies: [],
    tabs: [],
    groups: [],
    categories: [{ id: "category", name: "Pratos", active: true }],
    products: [
      {
        id: "burger",
        categoryId: "category",
        name: "Burger",
        description: "",
        priceCents: 2800,
        station: "cozinha",
        active: true,
        imageUrl: null,
        tag: "",
        recipeVersion: 1,
        recipe: [
          { stockItemId: "beef", quantityMilli: 180000 },
          { stockItemId: "bun", quantityMilli: 1000 },
        ],
        options: [
          {
            id: "cheese-option",
            name: "Queijo",
            priceCents: 250,
            recipe: [{ stockItemId: "cheese", quantityMilli: 30000 }],
          },
        ],
      },
    ],
    stockItems: [
      {
        id: "beef",
        name: "Carne",
        unit: "g",
        quantityMilli: 1000000,
        reservedMilli: 0,
        minimumMilli: 100000,
        averageCostMicros: 10000,
        active: true,
      },
      {
        id: "bun",
        name: "Pão",
        unit: "un",
        quantityMilli: 10000,
        reservedMilli: 0,
        minimumMilli: 2000,
        averageCostMicros: 1500000,
        active: true,
      },
      {
        id: "cheese",
        name: "Queijo",
        unit: "g",
        quantityMilli: 500000,
        reservedMilli: 0,
        minimumMilli: 50000,
        averageCostMicros: 20000,
        active: true,
      },
    ],
    orders: [],
    items: [],
    stockMovements: [],
    payments: [],
    refunds: [],
    cashSessions: [],
    cashMovements: [],
    reservations: [],
    waitlist: [],
    calls: [],
    audits: [],
    suppliers: [],
  };
}
function context(role: Role = "gestor"): CommandContext {
  let sequence = 0;
  return {
    actor: {
      userId: `${role}-user`,
      memberId: `${role}-member`,
      restaurantId: "restaurant",
      name: role,
      role,
    },
    now: NOW,
    id: () => `${role}-${++sequence}`,
  };
}
function run(
  state: RestaurantState,
  ctx: CommandContext,
  action: string,
  payload: Record<string, unknown> = {},
) {
  return applyCommand(state, { action, payload, operationId: ctx.id() }, ctx);
}
function open(state: RestaurantState, ctx: CommandContext, tableId = "table1") {
  const visitId = run(state, ctx, "visit.open", { tableIds: [tableId], people: 2 }).entityId!;
  return { visitId, tabId: state.tabs.find((tab) => tab.visitId === visitId)!.id };
}
function add(
  state: RestaurantState,
  ctx: CommandContext,
  tabId: string,
  quantity = 1,
  optionIds: string[] = [],
) {
  return run(state, ctx, "item.add", { tabId, productId: "burger", quantity, optionIds }).entityId!;
}
function stock(state: RestaurantState, id = "beef") {
  return state.stockItems.find((entry) => entry.id === id)!;
}
function currentItem(state: RestaurantState, itemId: string) {
  return state.items.find((entry) => entry.id === itemId)!;
}
function productPayload(state: RestaurantState, changes: Partial<Product> = {}) {
  return { ...state.products[0], ...changes };
}
function reserve(
  state: RestaurantState,
  ctx: CommandContext,
  overrides: Record<string, unknown> = {},
) {
  return run(state, ctx, "reservation.save", {
    customerName: "Ana",
    phone: "11999999999",
    people: 2,
    tableIds: ["table1"],
    startsAt: NOW,
    endsAt: "2026-11-10T20:00:00.000Z",
    notes: "",
    ...overrides,
  }).entityId!;
}
function rejected(fn: () => unknown, status: number) {
  assert.throws(fn, (error) => error instanceof AppError && error.status === status);
}

test("sending reserves ingredients and partial preparation consumes only the units started", () => {
  const state = fixture(),
    manager = context(),
    waiter = context("garcom"),
    kitchen = context("cozinha");
  const { tabId } = open(state, waiter);
  const itemId = add(state, waiter, tabId, 3);
  run(state, waiter, "order.send", { tabIds: [tabId] });
  assert.equal(stock(state).quantityMilli, 1000000);
  assert.equal(stock(state).reservedMilli, 540000);
  assert.equal(stock(state, "bun").reservedMilli, 3000);
  assert.equal(state.orders.length, 1);
  run(state, kitchen, "item.start", { itemId, quantity: 1 });
  assert.equal(stock(state).quantityMilli, 820000);
  assert.equal(stock(state).reservedMilli, 360000);
  assert.equal(currentItem(state, itemId).costCents, 330);
  run(state, kitchen, "item.ready", { itemId, quantity: 1 });
  run(state, waiter, "item.deliver", { itemId, quantity: 1 });
  assert.equal(currentItem(state, itemId).deliveredQuantity, 1);
  assert.notEqual(currentItem(state, itemId).status, "entregue");
  run(state, kitchen, "item.start", { itemId, quantity: 2 });
  run(state, kitchen, "item.ready", { itemId, quantity: 2 });
  run(state, waiter, "item.deliver", { itemId, quantity: 2 });
  assert.equal(currentItem(state, itemId).status, "entregue");
  assert.equal(currentItem(state, itemId).costCents, 990);
  assert.equal(stock(state).quantityMilli, 460000);
  assert.equal(stock(state).reservedMilli, 0);
  assert.equal(
    state.stockMovements
      .filter((movement) => movement.kind === "consumo" && movement.stockItemId === "beef")
      .reduce((total, movement) => total + movement.quantityMilli, 0),
    540000,
  );
  assert.throws(() => run(state, manager, "item.start", { itemId, quantity: 1 }), /pendentes/);
  assert.equal(stock(state).quantityMilli, 460000);
});

test("canceling unstarted units releases reservations without consuming or manufacturing losses", () => {
  const state = fixture(),
    ctx = context();
  const { tabId } = open(state, ctx);
  const itemId = add(state, ctx, tabId, 3);
  run(state, ctx, "order.send", { tabIds: [tabId] });
  run(state, ctx, "item.cancel", { itemId, quantity: 2, reason: "Cliente reduziu o pedido" });
  assert.equal(currentItem(state, itemId).quantity, 1);
  assert.equal(currentItem(state, itemId).status, "enviado");
  assert.equal(state.items.find((item) => item.status === "cancelado")?.quantity, 2);
  assert.equal(stock(state).quantityMilli, 1000000);
  assert.equal(stock(state).reservedMilli, 180000);
  assert.equal(tabTotals(state, tabId).subtotalCents, 2800);
  run(state, ctx, "item.cancel", { itemId, reason: "Desistiu da unidade restante" });
  assert.equal(stock(state).reservedMilli, 0);
  assert.equal(stock(state).quantityMilli, 1000000);
  assert.equal(
    state.stockMovements.filter(
      (movement) => movement.kind === "consumo" || movement.kind === "perda",
    ).length,
    0,
  );
});

test("three sent units, one started and two canceled preserve only the single consumption", () => {
  const state = fixture(),
    ctx = context();
  const { tabId } = open(state, ctx);
  const itemId = add(state, ctx, tabId, 3);
  run(state, ctx, "order.send", { tabIds: [tabId] });
  run(state, ctx, "item.start", { itemId, quantity: 1 });
  run(state, ctx, "item.cancel", {
    itemId,
    quantity: 2,
    reason: "Cancelar as unidades não iniciadas",
  });
  assert.equal(currentItem(state, itemId).quantity, 1);
  assert.equal(currentItem(state, itemId).startedQuantity, 1);
  assert.equal(currentItem(state, itemId).costCents, 330);
  assert.equal(stock(state).reservedMilli, 0);
  assert.equal(stock(state).quantityMilli, 820000);
  assert.equal(state.stockMovements.filter((movement) => movement.kind === "perda").length, 0);
  run(state, ctx, "item.ready", { itemId });
  run(state, ctx, "item.deliver", { itemId });
  assert.equal(currentItem(state, itemId).status, "entregue");
});

test("canceling started units records waste cost without a second physical stock withdrawal", () => {
  const state = fixture(),
    ctx = context();
  const { tabId } = open(state, ctx);
  const itemId = add(state, ctx, tabId, 3);
  run(state, ctx, "order.send", { tabIds: [tabId] });
  run(state, ctx, "item.start", { itemId });
  run(state, ctx, "item.cancel", { itemId, quantity: 1, reason: "Produto descartado" });
  assert.equal(stock(state).quantityMilli, 460000);
  assert.equal(stock(state).reservedMilli, 0);
  assert.equal(currentItem(state, itemId).quantity, 2);
  assert.equal(currentItem(state, itemId).startedQuantity, 2);
  assert.equal(currentItem(state, itemId).costCents, 660);
  const canceled = state.items.find((item) => item.status === "cancelado")!;
  assert.equal(canceled.quantity, 1);
  assert.equal(canceled.costCents, 330);
  assert.equal(
    state.stockMovements
      .filter((movement) => movement.kind === "perda")
      .reduce((total, movement) => total + movement.costCents, 0),
    330,
  );
  run(state, ctx, "item.cancel", { itemId, reason: "Descartar as demais" });
  assert.equal(stock(state).quantityMilli, 460000);
  assert.equal(
    state.stockMovements
      .filter((movement) => movement.kind === "perda")
      .reduce((total, movement) => total + movement.costCents, 0),
    990,
  );
});

test("mixed cancellation releases unstarted units then records only canceled consumed units", () => {
  const state = fixture(),
    ctx = context();
  const { tabId } = open(state, ctx);
  const itemId = add(state, ctx, tabId, 4);
  run(state, ctx, "order.send", { tabIds: [tabId] });
  run(state, ctx, "item.start", { itemId, quantity: 2 });
  run(state, ctx, "item.ready", { itemId, quantity: 2 });
  run(state, ctx, "item.deliver", { itemId, quantity: 1 });
  run(state, ctx, "item.cancel", { itemId, quantity: 3, reason: "Manter só a unidade já servida" });
  const kept = currentItem(state, itemId);
  assert.deepEqual(
    [kept.quantity, kept.startedQuantity, kept.readyQuantity, kept.deliveredQuantity],
    [1, 1, 1, 1],
  );
  assert.equal(kept.status, "entregue");
  assert.equal(stock(state).quantityMilli, 640000);
  assert.equal(stock(state).reservedMilli, 0);
  assert.equal(
    state.stockMovements
      .filter((movement) => movement.kind === "perda")
      .reduce((total, movement) => total + movement.costCents, 0),
    330,
  );
});

test("draft quantity removal changes neither stock nor received money", () => {
  const state = fixture(),
    ctx = context("garcom");
  const { tabId } = open(state, ctx);
  const itemId = add(state, ctx, tabId, 2);
  run(state, ctx, "item.quantity", { itemId, quantity: 0 });
  assert.equal(currentItem(state, itemId).status, "cancelado");
  assert.equal(tabTotals(state, tabId).totalCents, 0);
  assert.equal(state.stockMovements.length, 0);
  assert.equal(state.payments.length, 0);
});

test("sent recipe, price and cost snapshots survive later catalog and stock cost edits", () => {
  const state = fixture(),
    ctx = context();
  const { tabId } = open(state, ctx);
  const itemId = add(state, ctx, tabId);
  run(state, ctx, "order.send", { tabIds: [tabId] });
  const originalRecipe = structuredClone(currentItem(state, itemId).recipe);
  run(
    state,
    ctx,
    "product.save",
    productPayload(state, {
      priceCents: 3300,
      recipe: [
        { stockItemId: "beef", quantityMilli: 300000 },
        { stockItemId: "bun", quantityMilli: 1000 },
      ],
    }),
  );
  run(state, ctx, "stock.entry", {
    stockItemId: "beef",
    quantityMilli: 1000000,
    costCents: 10000,
    reason: "Compra mais cara",
  });
  assert.notEqual(stock(state).averageCostMicros, originalRecipe[0].unitCostMicros);
  run(state, ctx, "item.start", { itemId });
  assert.deepEqual(currentItem(state, itemId).recipe, originalRecipe);
  assert.equal(currentItem(state, itemId).recipeVersion, 1);
  assert.equal(currentItem(state, itemId).unitPriceCents, 2800);
  assert.equal(currentItem(state, itemId).costCents, 330);
  const secondId = add(state, ctx, tabId);
  run(state, ctx, "order.send", { tabIds: [tabId] });
  assert.equal(currentItem(state, secondId).unitPriceCents, 3300);
  assert.equal(currentItem(state, secondId).recipeVersion, 2);
  assert.equal(currentItem(state, secondId).recipe[0].quantityMilli, 300000);
});

test("a removed product option cannot silently disappear from a pending order recipe", () => {
  const state = fixture(),
    ctx = context();
  const { tabId } = open(state, ctx);
  add(state, ctx, tabId, 1, ["cheese-option"]);
  run(state, ctx, "product.save", productPayload(state, { options: [] }));
  rejected(() => run(state, ctx, "order.send", { tabIds: [tabId] }), 409);
  assert.equal(state.orders.length, 0);
  assert.equal(stock(state).reservedMilli, 0);
});

test("sending uses the current production station and refuses paused products", () => {
  const state = fixture(),
    ctx = context();
  const { tabId } = open(state, ctx);
  const itemId = add(state, ctx, tabId);
  run(state, ctx, "product.save", productPayload(state, { station: "bar" }));
  run(state, ctx, "order.send", { tabIds: [tabId] });
  assert.equal(currentItem(state, itemId).station, "bar");
  const secondId = add(state, ctx, tabId);
  run(state, ctx, "product.save", productPayload(state, { active: false }));
  rejected(() => run(state, ctx, "order.send", { tabIds: [tabId] }), 409);
  assert.equal(currentItem(state, secondId).status, "rascunho");
  assert.equal(stock(state).reservedMilli, 180000);
});

test("sequential competing sends cannot reserve the same last ingredients twice", () => {
  const state = fixture(),
    ctx = context();
  const first = open(state, ctx),
    second = open(state, ctx, "table2");
  const firstId = add(state, ctx, first.tabId, 4),
    secondId = add(state, ctx, second.tabId, 4);
  run(state, ctx, "order.send", { tabIds: [first.tabId] });
  rejected(() => run(state, ctx, "order.send", { tabIds: [second.tabId] }), 409);
  assert.equal(stock(state).reservedMilli, 720000);
  assert.equal(currentItem(state, secondId).status, "rascunho");
  assert.equal(state.orders.length, 1);
  run(state, ctx, "item.cancel", { itemId: firstId, reason: "Liberar pedido desistido" });
  run(state, ctx, "order.send", { tabIds: [second.tabId] });
  assert.equal(stock(state).reservedMilli, 720000);
  assert.equal(stock(state).quantityMilli, 1000000);
  assert.equal(state.orders.length, 2);
});

test("inventory count below total reservations blocks even a single unit until reconciled", () => {
  const state = fixture(),
    ctx = context();
  const { tabId } = open(state, ctx);
  const itemId = add(state, ctx, tabId, 2);
  run(state, ctx, "order.send", { tabIds: [tabId] });
  const adjustment = run(state, ctx, "stock.adjust", {
    stockItemId: "beef",
    quantityMilli: 180000,
    reason: "Contagem física divergente",
  });
  assert.match(adjustment.message, /reservas sem cobertura/);
  rejected(() => run(state, ctx, "item.start", { itemId, quantity: 1 }), 409);
  assert.equal(stock(state).quantityMilli, 180000);
  assert.equal(stock(state).reservedMilli, 360000);
  run(state, ctx, "stock.entry", {
    stockItemId: "beef",
    quantityMilli: 180000,
    costCents: 180,
    reason: "Reposição da diferença",
  });
  run(state, ctx, "item.start", { itemId, quantity: 1 });
  assert.equal(stock(state).quantityMilli, 180000);
  assert.equal(stock(state).reservedMilli, 180000);
});

test("stock unit changes cannot rewrite old movements or recipes attached only to options", () => {
  const state = fixture(),
    ctx = context();
  const stockId = run(state, ctx, "stock.save", { name: "Revenda", unit: "un" }).entityId!;
  run(state, ctx, "stock.entry", {
    stockItemId: stockId,
    quantityMilli: 1000,
    costCents: 100,
    reason: "Primeira entrada",
  });
  run(state, ctx, "stock.loss", { stockItemId: stockId, quantityMilli: 1000, reason: "Quebra" });
  rejected(() => run(state, ctx, "stock.save", { id: stockId, name: "Revenda", unit: "g" }), 409);
  const optionOnlyId = run(state, ctx, "stock.save", {
    name: "Ingrediente de opção",
    unit: "un",
  }).entityId!;
  run(
    state,
    ctx,
    "product.save",
    productPayload(state, {
      options: [
        {
          id: "new-option",
          name: "Adicional",
          priceCents: 50,
          recipe: [{ stockItemId: optionOnlyId, quantityMilli: 1000 }],
        },
      ],
    }),
  );
  rejected(
    () =>
      run(state, ctx, "stock.save", { id: optionOnlyId, name: "Ingrediente de opção", unit: "g" }),
    409,
  );
});

test("production, stock and post-send cancellation enforce their respective roles", () => {
  const state = fixture(),
    ctx = context(),
    waiter = context("garcom"),
    kitchen = context("cozinha"),
    bar = context("bar");
  const { tabId } = open(state, ctx);
  const itemId = add(state, waiter, tabId);
  run(state, waiter, "order.send", { tabIds: [tabId] });
  rejected(() => run(state, waiter, "item.cancel", { itemId, reason: "Sem autorização" }), 403);
  rejected(() => run(state, waiter, "item.start", { itemId }), 403);
  rejected(() => run(state, bar, "item.start", { itemId }), 403);
  rejected(() => run(state, kitchen, "item.deliver", { itemId }), 403);
  rejected(
    () =>
      run(state, waiter, "stock.adjust", {
        stockItemId: "beef",
        quantityMilli: 0,
        reason: "Sem autorização",
      }),
    403,
  );
  rejected(() => run(state, kitchen, "item.add", { tabId, productId: "burger" }), 403);
  run(state, kitchen, "item.start", { itemId });
  run(state, kitchen, "item.ready", { itemId });
  run(state, waiter, "item.deliver", { itemId });
  assert.equal(currentItem(state, itemId).status, "entregue");
});

test("closed tabs and visits reject order changes rather than resurrecting service", () => {
  const state = fixture(),
    ctx = context();
  const { tabId, visitId } = open(state, ctx);
  const itemId = add(state, ctx, tabId);
  state.tabs.find((tab) => tab.id === tabId)!.status = "fechada";
  for (const [action, payload] of [
    ["item.add", { tabId, productId: "burger" }],
    ["item.quantity", { itemId, quantity: 2 }],
    ["item.cancel", { itemId, reason: "Tardia" }],
    ["item.start", { itemId }],
    ["item.ready", { itemId }],
    ["item.deliver", { itemId }],
    ["order.send", { tabIds: [tabId] }],
  ] as [string, Record<string, unknown>][])
    rejected(() => run(state, ctx, action, payload), 409);
  state.visits.find((visit) => visit.id === visitId)!.closedAt = NOW;
  rejected(() => run(state, ctx, "tab.create", { visitId, label: "Não reabrir" }), 409);
  rejected(() => run(state, ctx, "visit.update", { visitId, people: 3 }), 409);
  assert.equal(stock(state).reservedMilli, 0);
});

test("direct-delivery products consume stock on separation and are ready without fictional cooking", () => {
  const state = fixture(),
    manager = context(),
    waiter = context("garcom");
  state.products[0].station = "direto";
  const { tabId } = open(state, manager);
  const itemId = add(state, waiter, tabId, 2);
  run(state, waiter, "order.send", { tabIds: [tabId] });
  run(state, waiter, "item.start", { itemId, quantity: 1 });
  assert.equal(currentItem(state, itemId).readyQuantity, 1);
  assert.equal(stock(state).quantityMilli, 820000);
  assert.equal(stock(state).reservedMilli, 180000);
  run(state, waiter, "item.deliver", { itemId, quantity: 1 });
  run(state, waiter, "item.start", { itemId, quantity: 1 });
  run(state, waiter, "item.deliver", { itemId, quantity: 1 });
  assert.equal(currentItem(state, itemId).status, "entregue");
  assert.equal(stock(state).quantityMilli, 640000);
});

test("reservation intervals reject overlap, allow a touching boundary and validate table capacity", () => {
  const state = fixture(),
    ctx = context("garcom");
  reserve(state, ctx);
  rejected(
    () =>
      reserve(state, ctx, {
        startsAt: "2026-11-10T19:30:00.000Z",
        endsAt: "2026-11-10T20:30:00.000Z",
      }),
    409,
  );
  reserve(state, ctx, { startsAt: "2026-11-10T20:00:00.000Z", endsAt: "2026-11-10T21:00:00.000Z" });
  reserve(state, ctx, { tableIds: ["table2"] });
  assert.equal(state.reservations.length, 3);
  assert.throws(() => reserve(state, ctx, { tableIds: ["table3"], people: 5 }), /comportam/);
  assert.throws(() => reserve(state, ctx, { tableIds: ["table3"], endsAt: NOW }), /posterior/);
});

test("reactivating a canceled reservation must recheck the interval against newer reservations", () => {
  const state = fixture(),
    ctx = context();
  const reservationId = reserve(state, ctx);
  run(state, ctx, "reservation.status", { reservationId, status: "cancelada" });
  reserve(state, ctx);
  rejected(
    () => run(state, ctx, "reservation.status", { reservationId, status: "confirmada" }),
    409,
  );
  assert.equal(
    state.reservations.find((reservation) => reservation.id === reservationId)!.status,
    "cancelada",
  );
});

test("a reserved table blocks walk-ins but allows the reservation's own single check-in", () => {
  const state = fixture(),
    ctx = context("garcom");
  const reservationId = reserve(state, ctx);
  rejected(() => open(state, ctx), 409);
  assert.equal(state.visits.length, 0);
  const result = run(state, ctx, "reservation.checkin", { reservationId });
  const reservation = state.reservations.find((entry) => entry.id === reservationId)!;
  assert.equal(reservation.status, "chegou");
  assert.equal(reservation.visitId, result.entityId);
  assert.equal(state.visits[0].customerName, "Ana");
  assert.equal(state.visits[0].people, 2);
  assert.equal(state.occupancies.length, 1);
  rejected(() => run(state, ctx, "reservation.checkin", { reservationId }), 409);
  assert.equal(state.visits.length, 1);
});

test("transferring an attendance cannot occupy somebody else's currently reserved table", () => {
  const state = fixture(),
    ctx = context("garcom");
  const { visitId } = open(state, ctx);
  reserve(state, ctx, { tableIds: ["table2"] });
  rejected(() => run(state, ctx, "visit.transfer", { visitId, tableId: "table2" }), 409);
  assert.equal(state.occupancies.filter((entry) => !entry.releasedAt)[0].tableId, "table1");
  run(state, ctx, "visit.transfer", { visitId, tableId: "table3" });
  assert.equal(state.occupancies.filter((entry) => !entry.releasedAt)[0].tableId, "table3");
});

test("waitlist seating preserves client identity, rejects occupied tables and cannot seat twice", () => {
  const state = fixture(),
    ctx = context("garcom");
  open(state, ctx);
  const waitId = run(state, ctx, "waitlist.add", {
    customerName: "João",
    phone: "11988888888",
    people: 3,
  }).entityId!;
  run(state, ctx, "waitlist.status", { waitId, status: "chamado" });
  rejected(() => run(state, ctx, "waitlist.seat", { waitId, tableId: "table1" }), 409);
  assert.equal(state.waitlist[0].status, "chamado");
  const result = run(state, ctx, "waitlist.seat", { waitId, tableId: "table2" });
  assert.equal(state.waitlist[0].status, "atendido");
  assert.equal(state.waitlist[0].visitId, result.entityId);
  const visit = state.visits.find((entry) => entry.id === result.entityId)!;
  assert.equal(visit.customerName, "João");
  assert.equal(visit.phone, "11988888888");
  assert.equal(visit.people, 3);
  rejected(() => run(state, ctx, "waitlist.seat", { waitId, tableId: "table3" }), 409);
});

test("delivery fees belong to the first tab only and other channels never take dining tables", () => {
  const state = fixture(),
    ctx = context();
  assert.throws(
    () => run(state, ctx, "visit.open", { channel: "delivery", people: 1 }),
    /cliente/i,
  );
  assert.throws(
    () => run(state, ctx, "visit.open", { channel: "balcao", tableIds: ["table1"] }),
    /não ocupa mesa/,
  );
  const visitId = run(state, ctx, "visit.open", {
    channel: "delivery",
    people: 1,
    customerName: "Maria",
    phone: "11977777777",
    address: "Rua 1, 10",
  }).entityId!;
  const tabId = state.tabs.find((tab) => tab.visitId === visitId)!.id;
  const extraId = run(state, ctx, "tab.create", { visitId, label: "Segunda comanda" }).entityId!;
  assert.equal(tabTotals(state, tabId).extraCents, 800);
  assert.equal(tabTotals(state, extraId).extraCents, 0);
  assert.equal(state.occupancies.length, 0);
});

test("partial paid consumption canceled later keeps allocations and exposes the exact refund", () => {
  const state = fixture(),
    ctx = context();
  const { tabId } = open(state, ctx);
  const itemId = add(state, ctx, tabId, 3);
  run(state, ctx, "order.send", { tabIds: [tabId] });
  run(state, ctx, "cash.open", { openingCents: 0 });
  const paymentId = run(state, ctx, "payment.record", {
    tabIds: [tabId],
    amountCents: 9240,
    method: "pix",
    itemIds: [itemId],
  }).entityId!;
  const originalAllocation = structuredClone(state.payments[0].allocations);
  run(state, ctx, "item.start", { itemId, quantity: 1 });
  run(state, ctx, "item.cancel", {
    itemId,
    quantity: 2,
    reason: "Devolver as duas unidades não iniciadas",
  });
  assert.deepEqual(state.payments[0].allocations, originalAllocation);
  assert.equal(tabTotals(state, tabId).totalCents, 3080);
  assert.equal(tabTotals(state, tabId).balanceCents, -6160);
  rejected(() => run(state, ctx, "tab.close", { tabId }), 409);
  run(state, ctx, "payment.refund", {
    paymentId,
    amountCents: 6160,
    reason: "Devolução do cancelamento parcial",
  });
  assert.equal(tabTotals(state, tabId).balanceCents, 0);
  run(state, ctx, "item.ready", { itemId });
  run(state, ctx, "item.deliver", { itemId });
  run(state, ctx, "tab.close", { tabId });
  assert.equal(stock(state).quantityMilli, 820000);
  assert.equal(stock(state).reservedMilli, 0);
});

test("restaurant context and operation permissions remain enforced when called without the UI", () => {
  const state = fixture(),
    ctx = context();
  ctx.actor.restaurantId = "other";
  rejected(() => run(state, ctx, "visit.open", { tableIds: ["table1"], people: 2 }), 403);
  assert.equal(state.visits.length, 0);
  rejected(
    () => run(state, context("cozinha"), "settings.update", { name: "Mudança indevida" }),
    403,
  );
  rejected(() => run(state, context("bar"), "reservation.save", { customerName: "Cliente" }), 403);
  assert.throws(() => run(state, context(), "inexistente", {}), /não reconhecida/);
});

test("subcent ingredient costs are identical for one batch or several partial preparations", () => {
  const outcomes: number[] = [];
  for (const fragmented of [false, true]) {
    const state = fixture(),
      ctx = context();
    state.products[0].recipe = [{ stockItemId: "bun", quantityMilli: 1000 }];
    stock(state, "bun").averageCostMicros = 5000; // Half a cent per unit.
    const { tabId } = open(state, ctx);
    const itemId = add(state, ctx, tabId, 3);
    run(state, ctx, "order.send", { tabIds: [tabId] });
    if (fragmented)
      for (let unit = 0; unit < 3; unit++) run(state, ctx, "item.start", { itemId, quantity: 1 });
    else run(state, ctx, "item.start", { itemId, quantity: 3 });
    outcomes.push(currentItem(state, itemId).costCents);
    assert.equal(
      state.stockMovements
        .filter((movement) => movement.kind === "consumo")
        .reduce((total, movement) => total + movement.costCents, 0),
      2,
    );
    run(state, ctx, "item.cancel", { itemId, quantity: 1, reason: "Descartar uma unidade" });
    assert.equal(currentItem(state, itemId).costCents, 1);
    assert.equal(state.items.find((item) => item.status === "cancelado")!.costCents, 1);
    assert.equal(
      state.stockMovements
        .filter((movement) => movement.kind === "perda")
        .reduce((total, movement) => total + movement.costCents, 0),
      1,
    );
    run(state, ctx, "item.cancel", { itemId, reason: "Descartar o restante" });
    assert.equal(
      state.stockMovements
        .filter((movement) => movement.kind === "perda")
        .reduce((total, movement) => total + movement.costCents, 0),
      2,
    );
    assert.equal(
      state.items.reduce((total, item) => total + item.costCents, 0),
      2,
    );
    assert.equal(stock(state, "bun").quantityMilli, 7000);
    assert.equal(stock(state, "bun").reservedMilli, 0);
  }
  assert.deepEqual(outcomes, [2, 2]);
});

test("subcent waste in mixed cancellation conserves the captured cost without another withdrawal", () => {
  const state = fixture(),
    ctx = context();
  state.products[0].recipe = [{ stockItemId: "bun", quantityMilli: 1000 }];
  stock(state, "bun").averageCostMicros = 5000;
  const { tabId } = open(state, ctx);
  const itemId = add(state, ctx, tabId, 4);
  run(state, ctx, "order.send", { tabIds: [tabId] });
  run(state, ctx, "item.start", { itemId, quantity: 3 });
  run(state, ctx, "item.cancel", {
    itemId,
    quantity: 2,
    reason: "Uma reservada e uma já preparada",
  });
  const kept = currentItem(state, itemId),
    canceled = state.items.find((item) => item.status === "cancelado")!;
  assert.deepEqual([kept.quantity, kept.startedQuantity, kept.costCents], [2, 2, 1]);
  assert.deepEqual([canceled.quantity, canceled.startedQuantity, canceled.costCents], [2, 1, 1]);
  assert.equal(stock(state, "bun").quantityMilli, 7000);
  assert.equal(stock(state, "bun").reservedMilli, 0);
  assert.equal(
    state.stockMovements
      .filter((movement) => movement.kind === "consumo")
      .reduce((total, movement) => total + movement.costCents, 0),
    2,
  );
  assert.equal(
    state.stockMovements
      .filter((movement) => movement.kind === "perda")
      .reduce((total, movement) => total + movement.costCents, 0),
    1,
  );
});
