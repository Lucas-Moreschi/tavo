import test from "node:test";
import assert from "node:assert/strict";
import { csvCell, reportData, reportRows } from "../../src/domain/reports";
import type { RestaurantState } from "../../src/domain/types";

test("limite final é exclusivo e exportações correspondem às vendas do intervalo", () => {
  const state = {
    restaurant: {},
    categories: [{ id: "c", name: "Pratos" }],
    products: [{ id: "p", name: "Prato", categoryId: "c" }],
    stockItems: [],
    stockMovements: [],
    visits: [{ id: "v", label: "Mesa 1", channel: "salao" }],
    cashSessions: [],
    cashMovements: [],
    tabs: [
      {
        id: "a",
        visitId: "v",
        label: "Ana",
        status: "fechada",
        closedAt: "2026-11-16T03:00:00.000Z",
        serviceRateBps: 0,
        discountCents: 0,
        extraCents: 0,
      },
      {
        id: "b",
        visitId: "v",
        label: "Bruno",
        status: "fechada",
        closedAt: "2026-11-17T03:00:00.000Z",
        serviceRateBps: 0,
        discountCents: 0,
        extraCents: 0,
      },
    ],
    items: ["a", "b"].map((id) => ({
      id,
      tabId: id,
      productId: "p",
      name: "Prato",
      quantity: 1,
      unitPriceCents: 1000,
      status: "entregue",
      costCents: 100,
    })),
    payments: [],
    refunds: [],
  } as unknown as RestaurantState;
  const since = "2026-11-16T03:00:00.000Z",
    until = "2026-11-17T03:00:00.000Z";
  const data = reportData(state, since, until);
  assert.equal(data.sold, 1000);
  assert.equal(data.sales.length, 1);
  const rows = reportRows(state, since, until, "vendas");
  assert.equal(rows.length, 2);
  assert.equal(rows[1][1], "Ana");
  const products = reportRows(state, since, until, "produtos");
  assert.equal(products[1][3], 1);
  assert.equal(products[1][4], 1000);
});
test("exportação neutraliza fórmulas e preserva negativos numéricos", () => {
  assert.equal(csvCell("=SUM(A1)"), '"\'=SUM(A1)"');
  assert.equal(csvCell(-100), '"-100"');
  assert.equal(csvCell('Nome "teste"'), '"Nome ""teste"""');
});
test("relatório separa venda encerrada dos recebimentos parciais e estornos", () => {
  const state = {
    restaurant: {},
    products: [],
    stockMovements: [],
    visits: [],
    cashSessions: [],
    cashMovements: [],
    tabs: [
      {
        id: "a",
        status: "fechada",
        closedAt: "2026-11-10T12:00:00Z",
        serviceRateBps: 1000,
        discountCents: 0,
        extraCents: 0,
      },
    ],
    items: [
      {
        id: "i",
        tabId: "a",
        productId: "p",
        quantity: 1,
        unitPriceCents: 1000,
        status: "entregue",
        costCents: 300,
        sentAt: "2026-11-10T10:00:00Z",
        startedAt: "2026-11-10T10:05:00Z",
        readyAt: "2026-11-10T10:15:00Z",
        readyQuantity: 1,
      },
    ],
    payments: [
      {
        amountCents: 600,
        createdAt: "2026-11-10T11:00:00Z",
        allocations: [{ tabId: "a", amountCents: 600 }],
      },
      {
        amountCents: 600,
        createdAt: "2026-11-10T11:30:00Z",
        allocations: [{ tabId: "a", amountCents: 600 }],
      },
    ],
    refunds: [
      {
        amountCents: 100,
        createdAt: "2026-11-10T11:40:00Z",
        allocations: [{ tabId: "a", amountCents: 100 }],
      },
    ],
  } as unknown as RestaurantState;
  const report = reportData(state, "2026-11-01");
  assert.equal(report.sold, 1100);
  assert.equal(report.received, 1200);
  assert.equal(report.refunded, 100);
  assert.equal(report.sales.length, 1);
  assert.equal(report.costs, 300);
  assert.equal(report.margin, 700);
  assert.equal(report.averageWaitMinutes, 5);
  assert.equal(report.averagePreparationMinutes, 10);
});
