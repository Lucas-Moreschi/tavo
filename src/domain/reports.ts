import type { RestaurantState } from "@/domain/types";
import { cashExpected, tabTotals } from "@/domain/finance";

export function reportData(state: RestaurantState, since: string, until?: string) {
  const inPeriod = (value: string | null) =>
    !!value &&
    new Date(value).getTime() >= new Date(since).getTime() &&
    (!until || new Date(value).getTime() < new Date(until).getTime());
  const sales = state.tabs.filter((tab) => tab.status === "fechada" && inPeriod(tab.closedAt));
  const saleIds = new Set(sales.map((tab) => tab.id));
  const soldItems = state.items.filter(
    (item) => saleIds.has(item.tabId) && !["cancelado", "rascunho"].includes(item.status),
  );
  const totals = sales.map((tab) => tabTotals(state, tab.id));
  const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
  const payments = state.payments.filter((payment) => inPeriod(payment.createdAt));
  const refunds = state.refunds.filter((refund) => inPeriod(refund.createdAt));
  const losses = state.stockMovements.filter(
    (movement) => movement.kind === "perda" && inPeriod(movement.createdAt),
  );
  const itemsInPeriod = state.items.filter(
    (item) => inPeriod(item.sentAt) && item.status !== "cancelado",
  );
  const wait = itemsInPeriod
    .filter((item) => item.startedAt)
    .map((item) =>
      Math.max(0, new Date(item.startedAt!).getTime() - new Date(item.sentAt!).getTime()),
    );
  const preparation = itemsInPeriod
    .filter((item) => item.startedAt && item.readyAt && (item.readyQuantity ?? 0) >= item.quantity)
    .map((item) =>
      Math.max(0, new Date(item.readyAt!).getTime() - new Date(item.startedAt!).getTime()),
    );
  const costs = sum(soldItems.map((item) => item.costCents));
  const subtotal = sum(totals.map((total) => total.subtotalCents));
  const discounts = sum(totals.map((total) => total.discountCents));
  return {
    sales,
    soldItems,
    payments,
    refunds,
    losses,
    subtotal,
    discounts,
    service: sum(totals.map((total) => total.serviceCents)),
    extra: sum(totals.map((total) => total.extraCents)),
    sold: sum(totals.map((total) => total.totalCents)),
    received: sum(payments.map((payment) => payment.amountCents)),
    refunded: sum(refunds.map((refund) => refund.amountCents)),
    outstanding: sum(
      state.tabs
        .filter((tab) => tab.status === "aberta")
        .map((tab) => Math.max(0, tabTotals(state, tab.id).balanceCents)),
    ),
    refundPending: sum(
      state.tabs
        .filter((tab) => tab.status === "aberta")
        .map((tab) => Math.max(0, -tabTotals(state, tab.id).balanceCents)),
    ),
    costs,
    lossCost: sum(losses.map((loss) => loss.costCents)),
    margin: subtotal - discounts - costs,
    averageWaitMinutes: wait.length ? sum(wait) / wait.length / 60000 : null,
    averagePreparationMinutes: preparation.length
      ? sum(preparation) / preparation.length / 60000
      : null,
    products: state.products
      .map((product) => {
        const items = soldItems.filter((item) => item.productId === product.id);
        return {
          ...product,
          soldQuantity: sum(items.map((item) => item.quantity)),
          soldCents: sum(items.map((item) => item.quantity * item.unitPriceCents)),
        };
      })
      .filter((product) => product.soldQuantity)
      .sort((a, b) => b.soldCents - a.soldCents),
    channels: ["salao", "balcao", "retirada", "delivery"].map((channel) => {
      const tabs = sales.filter((tab) =>
        state.visits.some((visit) => visit.id === tab.visitId && visit.channel === channel),
      );
      return {
        channel,
        tabs: tabs.length,
        total: sum(tabs.map((tab) => tabTotals(state, tab.id).totalCents)),
      };
    }),
    cash: state.cashSessions
      .filter((session) => inPeriod(session.openedAt) || inPeriod(session.closedAt))
      .map((session) => ({ ...session, expected: cashExpected(state, session.id) })),
  };
}
export function csvCell(value: string | number): string {
  const text = String(value);
  const safe = /^[\s]*[=+@-]/.test(text) && typeof value === "string" ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

export type ReportExport = "recebimentos" | "vendas" | "produtos" | "estoque" | "perdas" | "caixas";
export function reportRows(
  state: RestaurantState,
  since: string,
  until: string,
  kind: ReportExport,
): (string | number)[][] {
  const data = reportData(state, since, until);
  if (kind === "vendas")
    return [
      [
        "Comanda ID",
        "Comanda",
        "Atendimento",
        "Canal",
        "Encerrada em (UTC)",
        "Subtotal (centavos)",
        "Serviço (centavos)",
        "Desconto (centavos)",
        "Acréscimos (centavos)",
        "Total (centavos)",
      ],
      ...data.sales.map((tab) => {
        const total = tabTotals(state, tab.id);
        const visit = state.visits.find((entry) => entry.id === tab.visitId);
        return [
          tab.id,
          tab.label,
          visit?.label || "",
          visit?.channel || "",
          tab.closedAt || "",
          total.subtotalCents,
          total.serviceCents,
          total.discountCents,
          total.extraCents,
          total.totalCents,
        ];
      }),
    ];
  if (kind === "produtos")
    return [
      ["Produto ID", "Produto", "Categoria atual", "Quantidade", "Consumo (centavos)"],
      ...data.products.map((product) => [
        product.id,
        product.name,
        state.categories.find((category) => category.id === product.categoryId)?.name || "",
        product.soldQuantity,
        product.soldCents,
      ]),
    ];
  if (kind === "estoque")
    return [
      [
        "Item ID",
        "Ingrediente / produto",
        "Unidade",
        "Físico",
        "Reservado",
        "Disponível",
        "Mínimo",
        "Posição em (UTC)",
      ],
      ...state.stockItems.map((item) => [
        item.id,
        item.name,
        item.unit,
        item.quantityMilli / 1000,
        item.reservedMilli / 1000,
        (item.quantityMilli - item.reservedMilli) / 1000,
        item.minimumMilli / 1000,
        new Date().toISOString(),
      ]),
    ];
  if (kind === "perdas")
    return [
      [
        "Movimento ID",
        "Item de estoque",
        "Quantidade em milésimos",
        "Custo (centavos)",
        "Motivo",
        "Data (UTC)",
      ],
      ...data.losses.map((loss) => [
        loss.id,
        state.stockItems.find((item) => item.id === loss.stockItemId)?.name || loss.stockItemId,
        loss.quantityMilli,
        loss.costCents,
        loss.reason,
        loss.createdAt,
      ]),
    ];
  if (kind === "caixas")
    return [
      [
        "Caixa ID",
        "Caixa",
        "Aberto em (UTC)",
        "Fechado em (UTC)",
        "Esperado (centavos)",
        "Contado (centavos)",
        "Diferença (centavos)",
        "Justificativa",
      ],
      ...data.cash.map((cash) => [
        cash.id,
        cash.label,
        cash.openedAt,
        cash.closedAt || "",
        cash.expected,
        cash.countedCents ?? "",
        cash.differenceCents ?? "",
        cash.closeReason,
      ]),
    ];
  return [
    ["Tipo", "ID", "Data (UTC)", "Forma", "Valor (centavos)", "Referência"],
    ...data.payments.map((payment) => [
      "Recebimento",
      payment.id,
      payment.createdAt,
      payment.method,
      payment.amountCents,
      payment.reference,
    ]),
    ...data.refunds.map((refund) => [
      "Estorno",
      refund.id,
      refund.createdAt,
      state.payments.find((payment) => payment.id === refund.paymentId)?.method || "",
      -refund.amountCents,
      refund.reason,
    ]),
  ];
}
