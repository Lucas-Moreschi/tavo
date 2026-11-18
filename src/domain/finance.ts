import { assert } from "@/shared/lib/errors";
import type {
  CashSession,
  CommandContext,
  CommandResult,
  OrderItem,
  PaymentAllocation,
  RestaurantState,
  Role,
  Tab,
  TabTotals,
  Visit,
} from "@/domain/types";

type Payload = Record<string, unknown>;
const FINANCE_ROLES: Role[] = ["gestor", "caixa"];
const SERVICE_ROLES: Role[] = ["gestor", "garcom"];
const ACTIONS = new Set([
  "payment.record",
  "payment.refund",
  "cash.open",
  "cash.move",
  "cash.close",
  "tab.adjust",
  "tab.close",
  "tab.reopen",
  "visit.close",
  "item.transfer",
  "group.join",
  "group.split",
  "group.close",
]);

function authorize(ctx: CommandContext, roles: Role[]) {
  assert(roles.includes(ctx.actor.role), "Seu perfil não tem permissão para esta operação", 403);
}
function integer(value: unknown, name: string, minimum = 0): number {
  assert(
    typeof value === "number" && Number.isSafeInteger(value) && value >= minimum,
    `${name} inválido`,
  );
  return value;
}
function text(value: unknown, name: string): string {
  assert(typeof value === "string" && value.trim().length > 0, `Informe ${name}`);
  return value.trim();
}
function reason(value: unknown): string {
  return text(value, "o motivo");
}
function ids(value: unknown, name: string): string[] {
  assert(
    Array.isArray(value) &&
      value.length > 0 &&
      value.every((id) => typeof id === "string" && id.length > 0),
    `Selecione ${name}`,
  );
  assert(new Set(value).size === value.length, `A seleção de ${name} contém repetições`);
  return value as string[];
}
function safe(value: number): number {
  assert(Number.isSafeInteger(value), "O valor excede o limite permitido");
  return value;
}
function getTab(state: RestaurantState, id: unknown): Tab {
  const tab = state.tabs.find((entry) => entry.id === id);
  assert(tab, "Comanda não encontrada", 404);
  return tab;
}
function getVisit(state: RestaurantState, id: unknown): Visit {
  const visit = state.visits.find((entry) => entry.id === id);
  assert(visit, "Atendimento não encontrado", 404);
  return visit;
}
function openTab(state: RestaurantState, id: unknown): Tab {
  const tab = getTab(state, id);
  assert(tab.status === "aberta", "A comanda está fechada; o gestor precisa reabri-la", 409);
  assert(!getVisit(state, tab.visitId).closedAt, "O atendimento já foi encerrado", 409);
  return tab;
}
function activeCash(state: RestaurantState, requestedId?: unknown): CashSession {
  const sessions = state.cashSessions.filter((session) => !session.closedAt);
  assert(sessions.length === 1, "Abra uma sessão de caixa antes de continuar", 409);
  const session = sessions[0];
  assert(
    requestedId === undefined || requestedId === session.id,
    "Esta sessão de caixa não está aberta",
    409,
  );
  return session;
}
function sum(values: number[]): number {
  return values.reduce((total, value) => safe(total + value), 0);
}
function activeItems(state: RestaurantState, tabId: string): OrderItem[] {
  return state.items.filter((item) => item.tabId === tabId && item.status !== "cancelado");
}
function allocationTotal(allocations: PaymentAllocation[], tabId: string): number {
  return sum(
    allocations
      .filter((allocation) => allocation.tabId === tabId)
      .map((allocation) => allocation.amountCents),
  );
}

/** A negative balance is an explicit pending refund, never silently rounded away. */
export function tabTotals(state: RestaurantState, tabId: string): TabTotals {
  const tab = getTab(state, tabId);
  const subtotalCents = sum(
    activeItems(state, tabId).map((item) => safe(item.quantity * item.unitPriceCents)),
  );
  const serviceCents = Math.round(safe(subtotalCents * tab.serviceRateBps) / 10_000);
  const beforeDiscount = safe(subtotalCents + serviceCents + tab.extraCents);
  // A later partial cancellation can reduce the value below a previous discount.
  const discountCents = Math.min(tab.discountCents, beforeDiscount);
  const totalCents = safe(beforeDiscount - discountCents);
  const paidCents =
    sum(state.payments.map((payment) => allocationTotal(payment.allocations, tabId))) -
    sum(state.refunds.map((refund) => allocationTotal(refund.allocations, tabId)));
  return {
    subtotalCents,
    serviceCents,
    discountCents,
    extraCents: tab.extraCents,
    totalCents,
    paidCents,
    balanceCents: safe(totalCents - paidCents),
  };
}

/** Underlying tab identities survive both consolidation and subsequent separation. */
export function groupTabIds(state: RestaurantState, visitId: string): string[] {
  const visit = getVisit(state, visitId);
  const group = state.groups.find((entry) => entry.id === visit.groupId && !entry.closedAt);
  const visits = group
    ? state.visits
        .filter((entry) => entry.groupId === group.id && !entry.closedAt)
        .map((entry) => entry.id)
    : [visit.id];
  return state.tabs.filter((tab) => visits.includes(tab.visitId)).map((tab) => tab.id);
}

/** Only physical cash changes the drawer; Pix and cards remain separate receipts. */
export function cashExpected(state: RestaurantState, cashSessionId: string): number {
  const session = state.cashSessions.find((entry) => entry.id === cashSessionId);
  assert(session, "Sessão de caixa não encontrada", 404);
  const received = sum(
    state.payments
      .filter((payment) => payment.cashSessionId === session.id && payment.method === "dinheiro")
      .map((payment) => payment.amountCents),
  );
  const refunded = sum(
    state.refunds
      .filter(
        (refund) =>
          refund.cashSessionId === session.id &&
          state.payments.some(
            (payment) => payment.id === refund.paymentId && payment.method === "dinheiro",
          ),
      )
      .map((refund) => refund.amountCents),
  );
  const movements = sum(
    state.cashMovements
      .filter((movement) => movement.cashSessionId === session.id)
      .map((movement) =>
        movement.kind === "suprimento" ? movement.amountCents : -movement.amountCents,
      ),
  );
  return safe(session.openingCents + received - refunded + movements);
}

function netItemPaid(state: RestaurantState, itemId: string): number {
  const received = sum(
    state.payments
      .flatMap((payment) => payment.allocations)
      .filter((allocation) => allocation.itemId === itemId)
      .map((allocation) => allocation.amountCents),
  );
  const refunded = sum(
    state.refunds
      .flatMap((refund) => refund.allocations)
      .filter((allocation) => allocation.itemId === itemId)
      .map((allocation) => allocation.amountCents),
  );
  return received - refunded;
}

/** Allocate a tab total to item weights, including service/adjustments, in exact cents. */
function itemCharges(state: RestaurantState, tabId: string): Map<string, number> {
  const items = activeItems(state, tabId);
  const total = Math.max(0, tabTotals(state, tabId).totalCents);
  const weights = items.map((item) => BigInt(item.quantity) * BigInt(item.unitPriceCents));
  const weight = weights.reduce((a, b) => a + b, 0n);
  if (weight === 0n) return new Map(items.map((item) => [item.id, 0]));
  const parts = weights.map((value) => Number((BigInt(total) * value) / weight));
  const remainder = total - sum(parts);
  const order = weights
    .map((value, index) => ({ index, remainder: (BigInt(total) * value) % weight }))
    .sort((a, b) =>
      a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1,
    );
  for (let index = 0; index < remainder; index += 1) parts[order[index].index] += 1;
  return new Map(items.map((item, index) => [item.id, parts[index]]));
}

export function itemPayableCents(state: RestaurantState, itemId: string): number {
  const item = state.items.find((entry) => entry.id === itemId);
  if (!item || ["cancelado", "rascunho"].includes(item.status)) return 0;
  return Math.min(
    Math.max(0, tabTotals(state, item.tabId).balanceCents),
    Math.max(0, (itemCharges(state, item.tabId).get(item.id) ?? 0) - netItemPaid(state, item.id)),
  );
}

function sameAccountGroup(state: RestaurantState, tabs: Tab[]) {
  const visitIds = [...new Set(tabs.map((tab) => tab.visitId))];
  if (visitIds.length <= 1) return;
  const visits = visitIds.map((id) => getVisit(state, id));
  const groupId = visits[0].groupId;
  assert(
    groupId &&
      visits.every((visit) => visit.groupId === groupId) &&
      state.groups.some((group) => group.id === groupId && !group.closedAt),
    "As comandas precisam pertencer ao mesmo atendimento ou grupo",
    409,
  );
}

function recordPayment(
  state: RestaurantState,
  payload: Payload,
  ctx: CommandContext,
): CommandResult {
  authorize(ctx, FINANCE_ROLES);
  const cash = activeCash(state);
  const tabs = ids(payload.tabIds, "as comandas").map((id) => openTab(state, id));
  sameAccountGroup(state, tabs);
  assert(
    !tabs.some((tab) => activeItems(state, tab.id).some((item) => item.status === "rascunho")),
    "Envie ou remova os rascunhos antes de receber o pagamento",
    409,
  );
  const amountCents = integer(payload.amountCents, "Valor do pagamento", 1);
  const method = payload.method;
  assert(
    method === "pix" || method === "credito" || method === "debito" || method === "dinheiro",
    "Escolha uma forma de pagamento válida",
  );
  const tenderedCents =
    payload.tenderedCents === undefined
      ? amountCents
      : integer(payload.tenderedCents, "Valor entregue", 1);
  assert(tenderedCents >= amountCents, "O valor entregue é menor que o pagamento");
  assert(
    method === "dinheiro" || tenderedCents === amountCents,
    "Troco só é permitido para pagamento em dinheiro",
  );
  const balances = new Map(tabs.map((tab) => [tab.id, tabTotals(state, tab.id).balanceCents]));
  assert(
    [...balances.values()].every((balance) => balance >= 0),
    "Existe devolução pendente; registre o estorno antes de receber outro pagamento",
    409,
  );
  assert(
    amountCents <= sum([...balances.values()]),
    "O pagamento excede o saldo das comandas",
    409,
  );
  const allocations: PaymentAllocation[] = [];
  let remaining = amountCents;
  if (payload.itemIds !== undefined) {
    const selectedIds = ids(payload.itemIds, "os itens");
    const selected = selectedIds.map((id) => {
      const item = state.items.find((entry) => entry.id === id);
      assert(
        item && item.status !== "cancelado" && balances.has(item.tabId),
        "Um item selecionado não pertence às comandas abertas",
        409,
      );
      return item;
    });
    const charges = new Map(tabs.map((tab) => [tab.id, itemCharges(state, tab.id)]));
    for (const item of selected) {
      const available = Math.max(
        0,
        (charges.get(item.tabId)?.get(item.id) ?? 0) - netItemPaid(state, item.id),
      );
      const applied = Math.min(remaining, available, balances.get(item.tabId) ?? 0);
      if (applied > 0)
        allocations.push({ tabId: item.tabId, itemId: item.id, amountCents: applied });
      balances.set(item.tabId, (balances.get(item.tabId) ?? 0) - applied);
      remaining -= applied;
    }
    assert(remaining === 0, "O pagamento excede o saldo dos itens selecionados", 409);
  } else {
    for (const tab of tabs) {
      const applied = Math.min(remaining, balances.get(tab.id) ?? 0);
      if (applied > 0) allocations.push({ tabId: tab.id, amountCents: applied });
      remaining -= applied;
    }
  }
  const id = ctx.id();
  state.payments.push({
    id,
    cashSessionId: cash.id,
    method,
    amountCents,
    tenderedCents,
    changeCents: tenderedCents - amountCents,
    allocations,
    createdAt: ctx.now,
    createdBy: ctx.actor.memberId,
    reference: typeof payload.reference === "string" ? payload.reference.trim() : "",
  });
  return { entityId: id, message: "Recebimento registrado" };
}

function refundPayment(
  state: RestaurantState,
  payload: Payload,
  ctx: CommandContext,
): CommandResult {
  authorize(ctx, ["gestor"]);
  const cash = activeCash(state);
  const payment = state.payments.find((entry) => entry.id === payload.paymentId);
  assert(payment, "Pagamento não encontrado", 404);
  const amountCents = integer(payload.amountCents, "Valor do estorno", 1);
  const refundReason = reason(payload.reason);
  const previous = state.refunds.filter((refund) => refund.paymentId === payment.id);
  assert(
    amountCents <= payment.amountCents - sum(previous.map((refund) => refund.amountCents)),
    "O estorno excede o valor ainda recebido",
    409,
  );
  if (payment.method === "dinheiro")
    assert(
      amountCents <= cashExpected(state, cash.id),
      "O caixa não tem dinheiro suficiente para esta devolução",
      409,
    );
  const allocations: PaymentAllocation[] = [];
  let remaining = amountCents;
  for (const original of payment.allocations) {
    const alreadyRefunded = sum(
      previous
        .flatMap((refund) => refund.allocations)
        .filter(
          (allocation) =>
            allocation.tabId === original.tabId && allocation.itemId === original.itemId,
        )
        .map((allocation) => allocation.amountCents),
    );
    const applied = Math.min(remaining, original.amountCents - alreadyRefunded);
    if (applied > 0) {
      openTab(state, original.tabId);
      allocations.push({ ...original, amountCents: applied });
      remaining -= applied;
    }
  }
  assert(remaining === 0, "As alocações do pagamento não permitem este estorno", 409);
  const id = ctx.id();
  state.refunds.push({
    id,
    paymentId: payment.id,
    cashSessionId: cash.id,
    amountCents,
    allocations,
    reason: refundReason,
    createdAt: ctx.now,
    createdBy: ctx.actor.memberId,
  });
  return { entityId: id, message: "Estorno registrado na sessão de caixa atual" };
}

function closeTab(state: RestaurantState, tab: Tab, ctx: CommandContext) {
  const totals = tabTotals(state, tab.id);
  assert(
    totals.balanceCents === 0,
    totals.balanceCents < 0
      ? "Existe devolução pendente; registre o estorno antes de fechar"
      : "A comanda ainda possui saldo a receber",
    409,
  );
  assert(
    activeItems(state, tab.id).every((item) => item.status === "entregue"),
    "Há itens em rascunho, produção ou aguardando entrega",
    409,
  );
  tab.status = "fechada";
  tab.closedAt = ctx.now;
}

/** Mutates only the supplied restaurant state; the caller supplies isolation/idempotency. */
export function applyFinanceCommand(
  state: RestaurantState,
  command: { action: string; payload: Payload },
  ctx: CommandContext,
): CommandResult | null {
  const { action, payload } = command;
  if (!ACTIONS.has(action)) return null;
  assert(
    ctx.actor.restaurantId === state.restaurant.id,
    "O restaurante não pertence ao seu contexto de acesso",
    403,
  );
  if (action === "payment.record") return recordPayment(state, payload, ctx);
  if (action === "payment.refund") return refundPayment(state, payload, ctx);
  if (action === "group.close") {
    authorize(ctx, FINANCE_ROLES);
    const group = state.groups.find((entry) => entry.id === payload.groupId && !entry.closedAt);
    assert(group, "Grupo de mesas não encontrado", 404);
    const visits = state.visits.filter((visit) => visit.groupId === group.id && !visit.closedAt);
    const tabs = state.tabs.filter((tab) => visits.some((visit) => visit.id === tab.visitId));
    assert(visits.length > 0, "O grupo já está encerrado", 409);
    for (const tab of tabs) {
      assert(
        tabTotals(state, tab.id).balanceCents === 0,
        "Quite os saldos e resolva devoluções de todas as comandas antes de encerrar o grupo",
        409,
      );
      assert(
        activeItems(state, tab.id).every((item) => item.status === "entregue"),
        "Há itens do grupo aguardando preparo ou entrega",
        409,
      );
    }
    if (
      !tabs.some(
        (tab) => activeItems(state, tab.id).length > 0 || tabTotals(state, tab.id).paidCents !== 0,
      )
    )
      reason(payload.reason);
    for (const tab of tabs.filter((entry) => entry.status === "aberta")) closeTab(state, tab, ctx);
    for (const visit of visits) visit.closedAt = ctx.now;
    const visitIds = new Set(visits.map((visit) => visit.id));
    state.occupancies
      .filter((occupancy) => visitIds.has(occupancy.visitId) && !occupancy.releasedAt)
      .forEach((occupancy) => {
        occupancy.releasedAt = ctx.now;
      });
    group.closedAt = ctx.now;
    return { entityId: group.id, message: "Grupo encerrado, contas conferidas e mesas liberadas" };
  }
  if (action === "cash.open") {
    authorize(ctx, FINANCE_ROLES);
    assert(
      !state.cashSessions.some((session) => !session.closedAt),
      "Já existe uma sessão de caixa aberta",
      409,
    );
    const openingCents = integer(payload.openingCents, "Fundo de abertura");
    const id = ctx.id();
    state.cashSessions.push({
      id,
      label:
        typeof payload.label === "string" && payload.label.trim() ? payload.label.trim() : "Caixa",
      openedBy: ctx.actor.memberId,
      openedAt: ctx.now,
      closedAt: null,
      openingCents,
      countedCents: null,
      differenceCents: null,
      closeReason: "",
    });
    return { entityId: id, message: "Caixa aberto" };
  }
  if (action === "cash.move") {
    authorize(ctx, FINANCE_ROLES);
    const cash = activeCash(state, payload.cashSessionId);
    const amountCents = integer(payload.amountCents, "Valor do movimento", 1);
    const movementReason = reason(payload.reason);
    const kind = payload.kind;
    assert(kind === "suprimento" || kind === "sangria", "Escolha suprimento ou sangria");
    if (kind === "sangria")
      assert(
        amountCents <= cashExpected(state, cash.id),
        "A sangria excede o dinheiro esperado no caixa",
        409,
      );
    const id = ctx.id();
    state.cashMovements.push({
      id,
      cashSessionId: cash.id,
      kind,
      amountCents,
      reason: movementReason,
      createdAt: ctx.now,
      createdBy: ctx.actor.memberId,
    });
    return { entityId: id, message: "Movimento de caixa registrado" };
  }
  if (action === "cash.close") {
    authorize(ctx, FINANCE_ROLES);
    const cash = activeCash(state, payload.cashSessionId);
    const countedCents = integer(payload.countedCents, "Valor contado");
    const differenceCents = countedCents - cashExpected(state, cash.id);
    const closeReason =
      differenceCents === 0
        ? typeof payload.reason === "string"
          ? payload.reason.trim()
          : ""
        : reason(payload.reason);
    Object.assign(cash, { countedCents, differenceCents, closeReason, closedAt: ctx.now });
    return {
      entityId: cash.id,
      message:
        differenceCents === 0
          ? "Caixa fechado e conferido"
          : "Caixa fechado com divergência registrada",
    };
  }
  if (action === "tab.adjust") {
    authorize(ctx, ["gestor"]);
    const tab = openTab(state, payload.tabId);
    reason(payload.reason);
    const serviceRateBps =
      payload.serviceRateBps === undefined
        ? tab.serviceRateBps
        : integer(payload.serviceRateBps, "Taxa de serviço");
    assert(serviceRateBps <= 10_000, "A taxa de serviço não pode exceder 100%");
    const discountCents =
      payload.discountCents === undefined
        ? tab.discountCents
        : integer(payload.discountCents, "Desconto");
    const extraCents =
      payload.extraCents === undefined ? tab.extraCents : integer(payload.extraCents, "Acréscimo");
    const subtotal = tabTotals(state, tab.id).subtotalCents;
    assert(
      discountCents <= subtotal + Math.round(safe(subtotal * serviceRateBps) / 10_000) + extraCents,
      "O desconto excede o valor da comanda",
    );
    Object.assign(tab, { serviceRateBps, discountCents, extraCents });
    return {
      entityId: tab.id,
      message:
        tabTotals(state, tab.id).balanceCents < 0
          ? "Ajuste registrado; existe devolução pendente"
          : "Ajuste da comanda registrado",
    };
  }
  if (action === "tab.close") {
    authorize(ctx, FINANCE_ROLES);
    const tab = openTab(state, payload.tabId);
    closeTab(state, tab, ctx);
    return { entityId: tab.id, message: "Comanda encerrada" };
  }
  if (action === "tab.reopen") {
    authorize(ctx, ["gestor"]);
    reason(payload.reason);
    const tab = getTab(state, payload.tabId);
    assert(tab.status === "fechada", "A comanda já está aberta", 409);
    const visit = getVisit(state, tab.visitId);
    Object.assign(tab, { status: "aberta", closedAt: null });
    visit.closedAt = null;
    if (
      visit.groupId &&
      !state.groups.some((group) => group.id === visit.groupId && !group.closedAt)
    )
      visit.groupId = null;
    return {
      entityId: tab.id,
      message: "Comanda reaberta; as mesas anteriormente liberadas continuam disponíveis",
    };
  }
  if (action === "visit.close") {
    authorize(ctx, FINANCE_ROLES);
    const visit = getVisit(state, payload.visitId);
    assert(!visit.closedAt, "O atendimento já foi encerrado", 409);
    const tabs = state.tabs.filter((tab) => tab.visitId === visit.id);
    const hasConsumption = tabs.some(
      (tab) =>
        activeItems(state, tab.id).length > 0 ||
        tabTotals(state, tab.id).totalCents !== 0 ||
        tabTotals(state, tab.id).paidCents !== 0,
    );
    if (hasConsumption)
      assert(
        tabs.every((tab) => tab.status === "fechada"),
        "Encerre todas as comandas antes de liberar o atendimento",
        409,
      );
    else {
      reason(payload.reason);
      tabs.filter((tab) => tab.status === "aberta").forEach((tab) => closeTab(state, tab, ctx));
    }
    visit.closedAt = ctx.now;
    state.occupancies
      .filter((occupancy) => occupancy.visitId === visit.id && !occupancy.releasedAt)
      .forEach((occupancy) => {
        occupancy.releasedAt = ctx.now;
      });
    const group = state.groups.find((entry) => entry.id === visit.groupId && !entry.closedAt);
    if (group && !state.visits.some((entry) => entry.groupId === group.id && !entry.closedAt))
      group.closedAt = ctx.now;
    return { entityId: visit.id, message: "Atendimento encerrado e mesas liberadas" };
  }
  if (action === "item.transfer") {
    authorize(ctx, SERVICE_ROLES);
    const item = state.items.find((entry) => entry.id === payload.itemId);
    assert(item && item.status !== "cancelado", "Item não encontrado", 404);
    const source = openTab(state, item.tabId);
    const target = openTab(state, payload.targetTabId);
    assert(source.id !== target.id, "Escolha outra comanda de destino");
    assert(
      netItemPaid(state, item.id) === 0,
      "O item possui pagamento; estorne a alocação antes de transferir",
      409,
    );
    const sourceAfter = activeItems(state, source.id).filter((entry) => entry.id !== item.id);
    const subtotal = sum(sourceAfter.map((entry) => safe(entry.quantity * entry.unitPriceCents)));
    const sourceTotal = safe(
      subtotal +
        Math.round(safe(subtotal * source.serviceRateBps) / 10_000) +
        source.extraCents -
        source.discountCents,
    );
    assert(
      sourceTotal >= tabTotals(state, source.id).paidCents,
      "O consumo já está coberto por pagamentos ou ajustes na origem; resolva-os antes de transferir",
      409,
    );
    assert(
      tabTotals(state, target.id).balanceCents >= 0,
      "A comanda de destino possui devolução pendente",
      409,
    );
    item.tabId = target.id;
    return { entityId: item.id, message: "Consumo transferido; produção e estoque preservados" };
  }
  return applyGroupCommand(state, action, payload, ctx);
}

function applyGroupCommand(
  state: RestaurantState,
  action: string,
  payload: Payload,
  ctx: CommandContext,
): CommandResult | null {
  if (action !== "group.join" && action !== "group.split") return null;
  authorize(ctx, SERVICE_ROLES);
  if (action === "group.split") {
    const group = state.groups.find((entry) => entry.id === payload.groupId && !entry.closedAt);
    assert(group, "Grupo de mesas não encontrado", 404);
    group.closedAt = ctx.now;
    state.visits
      .filter((visit) => visit.groupId === group.id)
      .forEach((visit) => {
        visit.groupId = null;
      });
    return {
      entityId: group.id,
      message: "Grupo separado; contas, pagamentos e mesas de origem preservados",
    };
  }
  const tableIds = ids(payload.tableIds, "as mesas");
  assert(tableIds.length >= 2, "Selecione pelo menos duas mesas");
  assert(
    payload.mode === "unica" || payload.mode === "separadas",
    "Escolha conta única ou contas separadas",
  );
  const tables = tableIds.map((id) => {
    const table = state.tables.find((entry) => entry.id === id && entry.active);
    assert(table, "Uma das mesas não está disponível para atendimento", 409);
    return table;
  });
  const occupancies = state.occupancies.filter(
    (occupancy) => tableIds.includes(occupancy.tableId) && !occupancy.releasedAt,
  );
  assert(
    new Set(occupancies.map((occupancy) => occupancy.tableId)).size === occupancies.length,
    "Há ocupações conflitantes nas mesas selecionadas",
    409,
  );
  const freeTableIds = tableIds.filter(
    (id) => !occupancies.some((occupancy) => occupancy.tableId === id),
  );
  assert(
    !state.reservations.some(
      (reservation) =>
        reservation.status === "confirmada" &&
        reservation.tableIds.some((id) => freeTableIds.includes(id)) &&
        new Date(reservation.startsAt).getTime() <= new Date(ctx.now).getTime() &&
        new Date(reservation.endsAt).getTime() > new Date(ctx.now).getTime(),
    ),
    "Uma das mesas livres possui reserva neste horário; registre a chegada da reserva primeiro",
    409,
  );
  const visits = [...new Set(occupancies.map((occupancy) => occupancy.visitId))].map((id) =>
    getVisit(state, id),
  );
  assert(
    visits.every((visit) => !visit.closedAt),
    "Uma das mesas está vinculada a atendimento encerrado",
    409,
  );
  const initialPeople =
    visits.length === 0 ? integer(payload.people, "Número total de pessoas do grupo", 1) : 0;
  const oldGroupIds = [
    ...new Set(visits.map((visit) => visit.groupId).filter((id): id is string => !!id)),
  ];
  for (const oldGroupId of oldGroupIds) {
    const members = state.visits
      .filter((visit) => visit.groupId === oldGroupId && !visit.closedAt)
      .map((visit) => visit.id);
    assert(
      state.occupancies
        .filter((occupancy) => members.includes(occupancy.visitId) && !occupancy.releasedAt)
        .every((occupancy) => tableIds.includes(occupancy.tableId)),
      "Selecione todas as mesas do grupo existente antes de reorganizá-lo",
      409,
    );
  }
  assert(
    state.occupancies
      .filter(
        (occupancy) =>
          visits.some((visit) => visit.id === occupancy.visitId) && !occupancy.releasedAt,
      )
      .every((occupancy) => tableIds.includes(occupancy.tableId)),
    "Selecione todas as mesas de cada atendimento",
    409,
  );
  const id = ctx.id();
  const label =
    typeof payload.label === "string" && payload.label.trim()
      ? payload.label.trim()
      : `Mesas ${tables.map((table) => table.number).join(" + ")}`;
  let unassignedPeople = initialPeople;
  for (const table of tables) {
    if (occupancies.some((occupancy) => occupancy.tableId === table.id)) continue;
    const visitId = ctx.id();
    const visit: Visit = {
      id: visitId,
      label: `Mesa ${table.number}`,
      channel: "salao",
      people: unassignedPeople,
      groupId: id,
      openedAt: ctx.now,
      closedAt: null,
      createdBy: ctx.actor.memberId,
      customerName: "",
      phone: "",
      address: "",
      deliveryStatus: "aguardando",
      deliveryFeeCents: 0,
    };
    unassignedPeople = 0;
    state.visits.push(visit);
    visits.push(visit);
    state.occupancies.push({
      id: ctx.id(),
      tableId: table.id,
      visitId,
      openedAt: ctx.now,
      releasedAt: null,
    });
    state.tabs.push({
      id: ctx.id(),
      visitId,
      label: "Comanda principal",
      status: "aberta",
      serviceRateBps: state.restaurant.serviceRateBps,
      discountCents: 0,
      extraCents: 0,
      openedAt: ctx.now,
      closedAt: null,
    });
  }
  for (const oldGroupId of oldGroupIds) {
    const group = state.groups.find((entry) => entry.id === oldGroupId && !entry.closedAt);
    if (group) group.closedAt = ctx.now;
  }
  visits.forEach((visit) => {
    visit.groupId = id;
  });
  state.groups.push({ id, label, mode: payload.mode, createdAt: ctx.now, closedAt: null });
  return { entityId: id, message: "Mesas agrupadas com contas e pedidos de origem preservados" };
}
