import test from "node:test";
import assert from "node:assert/strict";
import {
  applyFinanceCommand,
  cashExpected,
  groupTabIds,
  tabTotals,
} from "../../src/domain/finance";
import { AppError } from "../../src/shared/lib/errors";
import { splitCents } from "../../src/shared/lib/format";
import { accountOrigin, accountTotals, groupTabs } from "../../src/domain/accounts";
import type {
  CommandContext,
  OrderItem,
  RestaurantState,
  Role,
  Tab,
  Visit,
} from "../../src/domain/types";

const NOW = "2026-11-10T19:00:00.000Z";
test("origem da conta usa a mesa atual e preserva a última ocupação no recibo encerrado", () => {
  const state = fixture();
  state.occupancies[0].releasedAt = NOW;
  state.occupancies.push({
    id: "transfer",
    tableId: "table3",
    visitId: "visit1",
    openedAt: NOW,
    releasedAt: null,
  });
  assert.equal(accountOrigin(state, state.tabs[0]), "Mesa 3");
  state.occupancies[2].releasedAt = "2026-11-10T20:00:00.000Z";
  assert.equal(accountOrigin(state, state.tabs[0]), "Mesa 3");
});
test("conta consolidada preserva recebimentos por origem e não compensa devoluções", () => {
  const state = fixture(),
    ctx = context();
  openCash(state, ctx);
  pay(state, ctx, 1000);
  const groupId = command(state, ctx, "group.join", {
    tableIds: ["table1", "table2"],
    mode: "unica",
  }).entityId!;
  state.items[0].status = "cancelado";
  const total = accountTotals(state, groupTabs(state, groupId));
  assert.equal(total.totalCents, 2000);
  assert.equal(total.paidCents, 1000);
  assert.equal(total.dueCents, 2000);
  assert.equal(total.refundCents, 1000);
  assert.throws(() => command(state, ctx, "group.close", { groupId }), /saldos/);
  assert.ok(state.visits.every((visit) => !visit.closedAt));
});
test("encerrar grupo valida todas as comandas antes de liberar mesas e mantém recibo histórico", () => {
  const state = fixture(),
    ctx = context();
  openCash(state, ctx);
  const groupId = command(state, ctx, "group.join", {
    tableIds: ["table1", "table2"],
    mode: "unica",
  }).entityId!;
  pay(state, ctx, 3000, { tabIds: ["tab1", "tab2"] });
  state.items[1].status = "pronto";
  assert.throws(() => command(state, ctx, "group.close", { groupId }), /preparo ou entrega/);
  assert.ok(state.tabs.every((tab) => tab.status === "aberta"));
  state.items[1].status = "entregue";
  forbidden(() => command(state, context("garcom"), "group.close", { groupId }));
  command(state, context("caixa"), "group.close", { groupId });
  assert.ok(state.visits.every((visit) => visit.closedAt));
  assert.ok(state.occupancies.every((occupancy) => occupancy.releasedAt));
  assert.equal(groupTabs(state, groupId).length, 2);
  assert.equal(accountTotals(state, groupTabs(state, groupId)).paidCents, 3000);
});
function visit(id: string): Visit {
  return {
    id,
    label: id,
    channel: "salao",
    people: 2,
    groupId: null,
    openedAt: NOW,
    closedAt: null,
    createdBy: "member",
    customerName: "",
    phone: "",
    address: "",
    deliveryStatus: "aguardando",
    deliveryFeeCents: 0,
  };
}
function tab(id: string, visitId: string): Tab {
  return {
    id,
    visitId,
    label: id,
    status: "aberta",
    serviceRateBps: 0,
    discountCents: 0,
    extraCents: 0,
    openedAt: NOW,
    closedAt: null,
  };
}
function item(
  id: string,
  tabId = "tab1",
  price = 1000,
  status: OrderItem["status"] = "entregue",
): OrderItem {
  return {
    id,
    orderId: "order1",
    tabId,
    productId: "product1",
    name: id,
    quantity: 1,
    unitPriceCents: price,
    status,
    station: "cozinha",
    notes: "",
    options: [],
    recipe: [{ stockItemId: "stock1", quantityMilli: 250, unitCostMicros: 10000 }],
    recipeVersion: 1,
    createdAt: NOW,
    sentAt: NOW,
    startedAt: NOW,
    readyAt: NOW,
    deliveredAt: NOW,
    cancelledAt: null,
    cancelReason: null,
    costCents: 100,
  };
}
function fixture(): RestaurantState {
  return {
    restaurant: {
      id: "restaurant1",
      name: "TAVO",
      slug: "tavo",
      plan: "academico",
      timezone: "America/Sao_Paulo",
      serviceRateBps: 1000,
      reservationMinutes: 90,
      deliveryFeeCents: 0,
      address: "",
      phone: "",
      createdAt: NOW,
    },
    tables: [1, 2, 3, 4].map((number) => ({
      id: `table${number}`,
      number,
      capacity: 4,
      sector: "Salão",
      active: true,
    })),
    occupancies: [1, 2].map((number) => ({
      id: `occ${number}`,
      tableId: `table${number}`,
      visitId: `visit${number}`,
      openedAt: NOW,
      releasedAt: null,
    })),
    visits: [visit("visit1"), visit("visit2")],
    groups: [],
    tabs: [tab("tab1", "visit1"), tab("tab2", "visit2")],
    categories: [],
    products: [],
    stockItems: [],
    orders: [{ id: "order1", visitId: "visit1", createdAt: NOW, createdBy: "member" }],
    items: [item("item1"), item("item2", "tab2", 2000)],
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
      userId: "user1",
      memberId: "member",
      restaurantId: "restaurant1",
      name: "Equipe",
      role,
    },
    now: NOW,
    id: () => `${role}-generated-${++sequence}`,
  };
}
function command(
  state: RestaurantState,
  ctx: CommandContext,
  action: string,
  payload: Record<string, unknown> = {},
) {
  const result = applyFinanceCommand(state, { action, payload }, ctx);
  assert.ok(result, `Command ${action} must be handled`);
  return result;
}
function openCash(state: RestaurantState, ctx: CommandContext, openingCents = 0) {
  return command(state, ctx, "cash.open", { openingCents, label: "Turno" }).entityId!;
}
function pay(
  state: RestaurantState,
  ctx: CommandContext,
  amountCents: number,
  overrides: Record<string, unknown> = {},
) {
  return command(state, ctx, "payment.record", {
    tabIds: ["tab1"],
    amountCents,
    method: "pix",
    ...overrides,
  }).entityId!;
}
function forbidden(fn: () => unknown) {
  assert.throws(fn, (error) => error instanceof AppError && error.status === 403);
}

test("totals preserve integer cents, price snapshots and canceled consumption", () => {
  const state = fixture();
  state.tabs[0].serviceRateBps = 1000;
  state.tabs[0].extraCents = 150;
  state.tabs[0].discountCents = 51;
  state.items[0].unitPriceCents = 333;
  state.items.push(item("cancelled", "tab1", 9999, "cancelado"));
  assert.deepEqual(tabTotals(state, "tab1"), {
    subtotalCents: 333,
    serviceCents: 33,
    discountCents: 51,
    extraCents: 150,
    totalCents: 465,
    paidCents: 0,
    balanceCents: 465,
  });
  assert.deepEqual(splitCents(1000, 3), [334, 333, 333]);
  assert.equal(
    splitCents(1000, 3).reduce((a, b) => a + b),
    1000,
  );
});

test("mixed partial receipts close exactly and physical cash excludes Pix/cards", () => {
  const state = fixture();
  const ctx = context("caixa");
  const cashId = openCash(state, ctx, 10000);
  pay(state, ctx, 333);
  pay(state, ctx, 334, { method: "credito" });
  pay(state, ctx, 333, { method: "dinheiro", tenderedCents: 500 });
  assert.equal(state.payments[2].changeCents, 167);
  assert.equal(tabTotals(state, "tab1").balanceCents, 0);
  assert.equal(cashExpected(state, cashId), 10333);
  command(state, ctx, "tab.close", { tabId: "tab1" });
  command(state, ctx, "visit.close", { visitId: "visit1" });
  assert.equal(state.tabs[0].status, "fechada");
  assert.equal(state.occupancies[0].releasedAt, NOW);
});

test("receipt rejects overpayments, duplicate selections, unsafe amounts and wrong tender", () => {
  const state = fixture();
  const ctx = context();
  openCash(state, ctx);
  assert.throws(() => pay(state, ctx, 1001), /excede o saldo/);
  assert.throws(() => pay(state, ctx, 1, { tabIds: ["tab1", "tab1"] }), /repetições/);
  assert.throws(() => pay(state, ctx, 0.5), /inválido/);
  assert.throws(() => pay(state, ctx, Number.MAX_SAFE_INTEGER + 1), /inválido/);
  assert.throws(() => pay(state, ctx, 100, { method: "dinheiro", tenderedCents: 50 }), /menor/);
  assert.throws(() => pay(state, ctx, 100, { method: "pix", tenderedCents: 150 }), /Troco/);
  assert.throws(() => pay(state, ctx, 100, { method: "boleto" }), /forma de pagamento/);
  assert.equal(state.payments.length, 0);
});

test("receiving requires active cash and sends drafts before charging", () => {
  const state = fixture();
  const ctx = context();
  assert.throws(() => pay(state, ctx, 100), /Abra uma sessão/);
  openCash(state, ctx);
  state.items[0].status = "rascunho";
  assert.throws(() => pay(state, ctx, 100), /rascunhos/);
  state.items[0].status = "enviado";
  pay(state, ctx, 1000);
  assert.throws(() => command(state, ctx, "tab.close", { tabId: "tab1" }), /produção/);
  state.items[0].status = "entregue";
  command(state, ctx, "tab.close", { tabId: "tab1" });
});

test("cash movements and discrepancies remain attributable to their session", () => {
  const state = fixture();
  const ctx = context("caixa");
  const cashId = openCash(state, ctx, 1000);
  assert.throws(() => openCash(state, ctx), /Já existe/);
  command(state, ctx, "cash.move", {
    cashSessionId: cashId,
    kind: "suprimento",
    amountCents: 200,
    reason: "Troco",
  });
  command(state, ctx, "cash.move", {
    cashSessionId: cashId,
    kind: "sangria",
    amountCents: 300,
    reason: "Depósito",
  });
  assert.equal(cashExpected(state, cashId), 900);
  assert.throws(
    () =>
      command(state, ctx, "cash.move", { kind: "sangria", amountCents: 901, reason: "Excesso" }),
    /excede/,
  );
  assert.throws(() => command(state, ctx, "cash.close", { countedCents: 899 }), /motivo/);
  command(state, ctx, "cash.close", { countedCents: 899, reason: "Diferença de contagem" });
  assert.equal(state.cashSessions[0].differenceCents, -1);
  assert.equal(state.cashSessions[0].closeReason, "Diferença de contagem");
  assert.throws(() => pay(state, ctx, 100), /Abra uma sessão/);
});

test("refund from a closed cash session belongs to current cash without rewriting history", () => {
  const state = fixture();
  const ctx = context();
  const originalCash = openCash(state, ctx);
  const paymentId = pay(state, ctx, 1000, { method: "dinheiro" });
  command(state, ctx, "cash.close", { countedCents: 1000 });
  const oldSession = structuredClone(state.cashSessions[0]);
  const currentCash = openCash(state, ctx, 1000);
  command(state, ctx, "payment.refund", {
    paymentId,
    amountCents: 400,
    reason: "Devolução parcial",
  });
  assert.equal(state.refunds[0].cashSessionId, currentCash);
  assert.equal(cashExpected(state, currentCash), 600);
  assert.equal(cashExpected(state, originalCash), 1000);
  assert.deepEqual(state.cashSessions[0], oldSession);
  assert.equal(tabTotals(state, "tab1").paidCents, 600);
  assert.equal(tabTotals(state, "tab1").balanceCents, 400);
  assert.throws(
    () => command(state, ctx, "payment.refund", { paymentId, amountCents: 601, reason: "Excesso" }),
    /excede/,
  );
});

test("refund refuses closed tabs until explicit manager reopening and never reoccupies tables", () => {
  const state = fixture();
  const ctx = context();
  openCash(state, ctx);
  const paymentId = pay(state, ctx, 1000);
  command(state, ctx, "tab.close", { tabId: "tab1" });
  command(state, ctx, "visit.close", { visitId: "visit1" });
  assert.throws(
    () =>
      command(state, ctx, "payment.refund", { paymentId, amountCents: 200, reason: "Correção" }),
    /reabri/,
  );
  command(state, ctx, "tab.reopen", { tabId: "tab1", reason: "Correção autorizada" });
  command(state, ctx, "payment.refund", { paymentId, amountCents: 200, reason: "Correção" });
  assert.equal(state.tabs[0].status, "aberta");
  assert.equal(state.visits[0].closedAt, null);
  assert.equal(state.occupancies[0].releasedAt, NOW);
  assert.equal(tabTotals(state, "tab1").balanceCents, 200);
});

test("adjustment after payment exposes pending refund and blocks closure until refunded", () => {
  const state = fixture();
  const ctx = context();
  openCash(state, ctx);
  const paymentId = pay(state, ctx, 1000);
  command(state, ctx, "tab.adjust", {
    tabId: "tab1",
    discountCents: 100,
    reason: "Desconto autorizado",
  });
  assert.equal(tabTotals(state, "tab1").balanceCents, -100);
  assert.throws(() => command(state, ctx, "tab.close", { tabId: "tab1" }), /devolução pendente/);
  assert.throws(() => pay(state, ctx, 1), /devolução pendente/);
  command(state, ctx, "payment.refund", {
    paymentId,
    amountCents: 100,
    reason: "Devolver desconto",
  });
  assert.equal(tabTotals(state, "tab1").balanceCents, 0);
  command(state, ctx, "tab.close", { tabId: "tab1" });
});

test("cancellation cannot turn an old discount into a negative consumption total", () => {
  const state = fixture();
  const ctx = context();
  command(state, ctx, "tab.adjust", { tabId: "tab1", discountCents: 500, reason: "Desconto" });
  state.items[0].status = "cancelado";
  assert.equal(tabTotals(state, "tab1").totalCents, 0);
  assert.equal(tabTotals(state, "tab1").discountCents, 0);
});

test("item selection allocates service and remainder exactly and cannot be charged twice", () => {
  const state = fixture();
  const ctx = context();
  state.items = [item("a", "tab1", 333), item("b", "tab1", 333), item("c", "tab1", 334)];
  state.tabs[0].serviceRateBps = 1000;
  openCash(state, ctx);
  pay(state, ctx, 366, { itemIds: ["a"] });
  assert.equal(state.payments[0].allocations[0].itemId, "a");
  assert.throws(() => pay(state, ctx, 2, { itemIds: ["a"] }), /excede o saldo dos itens/);
  pay(state, ctx, 366, { itemIds: ["b"] });
  pay(state, ctx, 368, { itemIds: ["c"] });
  assert.equal(tabTotals(state, "tab1").balanceCents, 0);
  assert.equal(
    state.payments
      .flatMap((payment) => payment.allocations)
      .reduce((total, allocation) => total + allocation.amountCents, 0),
    1100,
  );
});

test("joining occupied tables and separating preserves payments, production and stock", () => {
  const state = fixture();
  const ctx = context();
  openCash(state, ctx);
  pay(state, ctx, 300);
  const originals = structuredClone({
    items: state.items,
    orders: state.orders,
    stock: state.stockMovements,
    payment: state.payments,
  });
  const totalsBefore = state.tabs.map((tab) => tabTotals(state, tab.id));
  const groupId = command(state, ctx, "group.join", {
    tableIds: ["table1", "table2"],
    mode: "unica",
  }).entityId;
  assert.deepEqual(groupTabIds(state, "visit1"), ["tab1", "tab2"]);
  const paymentId = pay(state, ctx, 1001, { tabIds: ["tab1", "tab2"] });
  assert.deepEqual(state.payments.find((payment) => payment.id === paymentId)?.allocations, [
    { tabId: "tab1", amountCents: 700 },
    { tabId: "tab2", amountCents: 301 },
  ]);
  command(state, ctx, "group.split", { groupId });
  assert.deepEqual(groupTabIds(state, "visit1"), ["tab1"]);
  assert.deepEqual(state.items, originals.items);
  assert.deepEqual(state.orders, originals.orders);
  assert.deepEqual(state.stockMovements, originals.stock);
  assert.deepEqual(state.payments[0], originals.payment[0]);
  assert.equal(tabTotals(state, "tab1").balanceCents, 0);
  assert.equal(tabTotals(state, "tab2").balanceCents, 1699);
  assert.equal(
    state.tabs.reduce((total, tab) => total + tabTotals(state, tab.id).totalCents, 0),
    totalsBefore.reduce((total, tab) => total + tab.totalCents, 0),
  );
  assert.ok(state.occupancies.every((occupancy) => occupancy.releasedAt === null));
  command(state, ctx, "payment.refund", {
    paymentId,
    amountCents: 800,
    reason: "Devolução após separar",
  });
  assert.deepEqual(state.refunds[0].allocations, [
    { tabId: "tab1", amountCents: 700 },
    { tabId: "tab2", amountCents: 100 },
  ]);
  command(state, ctx, "payment.refund", {
    paymentId,
    amountCents: 201,
    reason: "Restante da devolução",
  });
  assert.deepEqual(state.refunds[1].allocations, [{ tabId: "tab2", amountCents: 201 }]);
  assert.equal(tabTotals(state, "tab1").paidCents, 300);
  assert.equal(tabTotals(state, "tab2").paidCents, 0);
});

test("all-free grouping records an explicit group people count without inventing people", () => {
  const state = fixture();
  const ctx = context("garcom");
  assert.throws(
    () => command(state, ctx, "group.join", { tableIds: ["table3", "table4"], mode: "separadas" }),
    /pessoas/,
  );
  const groupId = command(state, ctx, "group.join", {
    tableIds: ["table3", "table4"],
    mode: "separadas",
    people: 7,
  }).entityId;
  const visits = state.visits.filter((visit) => visit.groupId === groupId);
  assert.equal(visits.length, 2);
  assert.deepEqual(
    visits.map((visit) => visit.people),
    [7, 0],
  );
  assert.equal(groupTabIds(state, visits[0].id).length, 2);
  assert.ok(
    state.occupancies
      .filter((occupancy) => ["table3", "table4"].includes(occupancy.tableId))
      .every((occupancy) => !occupancy.releasedAt),
  );
});

test("additional free tables preserve the people already recorded and previous account IDs", () => {
  const state = fixture();
  const ctx = context("garcom");
  const groupId = command(state, ctx, "group.join", {
    tableIds: ["table1", "table3"],
    mode: "unica",
  }).entityId;
  assert.equal(
    state.visits
      .filter((visit) => visit.groupId === groupId)
      .reduce((total, visit) => total + visit.people, 0),
    2,
  );
  assert.ok(groupTabIds(state, "visit1").includes("tab1"));
  assert.equal(state.items[0].tabId, "tab1");
  assert.throws(
    () => command(state, ctx, "group.join", { tableIds: ["table1", "table4"], mode: "unica" }),
    /todas as mesas/,
  );
});

test("grouping rejects active reservations and arbitrary cross-account consolidation", () => {
  const state = fixture();
  const ctx = context();
  state.reservations.push({
    id: "r1",
    customerName: "Cliente",
    phone: "",
    people: 2,
    tableIds: ["table3"],
    startsAt: "2026-11-10T18:30:00.000Z",
    endsAt: "2026-11-10T20:00:00.000Z",
    notes: "",
    status: "confirmada",
    visitId: null,
  });
  assert.throws(
    () => command(state, ctx, "group.join", { tableIds: ["table1", "table3"], mode: "unica" }),
    /reserva neste horário/,
  );
  openCash(state, ctx);
  assert.throws(
    () => pay(state, ctx, 100, { tabIds: ["tab1", "tab2"] }),
    /mesmo atendimento ou grupo/,
  );
});

test("unpaid item transfer does not repeat stock/production and paid allocations cannot move", () => {
  const state = fixture();
  const ctx = context();
  const before = structuredClone(state.items[0]);
  command(state, ctx, "item.transfer", { itemId: "item1", targetTabId: "tab2" });
  assert.deepEqual(state.items[0], { ...before, tabId: "tab2" });
  assert.equal(state.orders.length, 1);
  assert.equal(state.stockMovements.length, 0);
  openCash(state, ctx);
  pay(state, ctx, 100, { tabIds: ["tab2"], itemIds: ["item1"] });
  assert.throws(
    () => command(state, ctx, "item.transfer", { itemId: "item1", targetTabId: "tab1" }),
    /possui pagamento/,
  );
});

test("generic partial payments block transferring consumption required to cover them", () => {
  const state = fixture();
  const ctx = context();
  state.items.push(item("other", "tab1", 1000));
  openCash(state, ctx);
  pay(state, ctx, 1500);
  assert.throws(
    () => command(state, ctx, "item.transfer", { itemId: "item1", targetTabId: "tab2" }),
    /coberto por pagamentos/,
  );
  assert.equal(state.items[0].tabId, "tab1");
});

test("empty visit closure requires a reason and frees the table without a fake payment", () => {
  const state = fixture();
  const ctx = context("caixa");
  state.items = state.items.filter((item) => item.tabId !== "tab1");
  assert.throws(() => command(state, ctx, "visit.close", { visitId: "visit1" }), /motivo/);
  command(state, ctx, "visit.close", { visitId: "visit1", reason: "Cliente desistiu" });
  assert.equal(state.payments.length, 0);
  assert.equal(state.tabs[0].status, "fechada");
  assert.equal(state.occupancies[0].releasedAt, NOW);
});

test("role checks protect finance exceptions, group operations and restaurant isolation", () => {
  const cases: [Role, string, Record<string, unknown>][] = [
    ["garcom", "cash.open", { openingCents: 0 }],
    ["cozinha", "payment.record", {}],
    ["bar", "group.join", {}],
    ["caixa", "tab.adjust", {}],
    ["caixa", "payment.refund", {}],
    ["caixa", "tab.reopen", {}],
    ["garcom", "tab.close", {}],
    ["caixa", "item.transfer", {}],
    ["cozinha", "group.split", {}],
  ];
  for (const [role, action, payload] of cases)
    forbidden(() => command(fixture(), context(role), action, payload));
  const state = fixture();
  const outsider = context();
  outsider.actor.restaurantId = "other-restaurant";
  forbidden(() => command(state, outsider, "cash.open", { openingCents: 0 }));
  assert.equal(state.cashSessions.length, 0);
  assert.equal(
    applyFinanceCommand(state, { action: "product.create", payload: {} }, context()),
    null,
  );
});
