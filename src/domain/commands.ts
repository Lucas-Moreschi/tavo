import type {
  Actor,
  Command,
  CommandContext,
  CommandResult,
  ItemStatus,
  OrderItem,
  Product,
  RecipeLine,
  RestaurantState,
  Role,
  StockItem,
  StockSnapshot,
  Visit,
} from "@/domain/types";
import { AppError, assert } from "@/shared/lib/errors";
import { applyFinanceCommand } from "@/domain/finance";

type Payload = Record<string, unknown>;
function text(value: unknown, label: string, required = true, max = 250): string {
  assert(value === undefined || value === null || typeof value === "string", `${label} inválido`);
  const result = String(value ?? "").trim();
  assert(
    (!required || result.length > 0) && result.length <= max,
    `${label}: informe até ${max} caracteres`,
  );
  return result;
}
function integer(value: unknown, label: string, min = 0, max = 1_000_000_000): number {
  assert(
    typeof value === "number" && Number.isSafeInteger(value) && value >= min && value <= max,
    `${label} inválido`,
  );
  return value;
}
function roles(actor: Actor, allowed: Role[]) {
  assert(
    actor.role === "gestor" || allowed.includes(actor.role),
    "Seu perfil não pode executar esta ação",
    403,
  );
}
function find<T extends { id: string }>(list: T[], id: unknown, label: string): T {
  const result = list.find((entry) => entry.id === id);
  assert(result, `${label} não encontrado`, 404);
  return result;
}
function bool(value: unknown, fallback = true): boolean {
  assert(value === undefined || typeof value === "boolean", "Valor de ativação inválido");
  return value === undefined ? fallback : value;
}
function iso(value: unknown, label: string): string {
  const date = new Date(text(value, label));
  assert(Number.isFinite(date.getTime()), `${label} inválido`);
  return date.toISOString();
}
function uniqueStrings(value: unknown, label: string): string[] {
  assert(
    Array.isArray(value) && value.length <= 200 && value.every((v) => typeof v === "string"),
    `${label} inválido`,
  );
  return [...new Set(value as string[])];
}
function activeVisit(state: RestaurantState, visitId: unknown): Visit {
  const visit = find(state.visits, visitId, "Atendimento");
  assert(!visit.closedAt, "Este atendimento já foi encerrado", 409);
  return visit;
}
function openTab(state: RestaurantState, tabId: unknown) {
  const tab = find(state.tabs, tabId, "Comanda");
  assert(tab.status === "aberta", "Esta comanda está fechada", 409);
  activeVisit(state, tab.visitId);
  return tab;
}
function stockMovement(
  state: RestaurantState,
  ctx: CommandContext,
  stockItemId: string,
  kind: RestaurantState["stockMovements"][number]["kind"],
  quantityMilli: number,
  reason: string,
  itemId: string | null = null,
  costCents = 0,
) {
  state.stockMovements.push({
    id: ctx.id(),
    stockItemId,
    itemId,
    kind,
    quantityMilli,
    costCents,
    reason,
    createdAt: ctx.now,
    createdBy: ctx.actor.userId,
  });
}
function recipeLines(state: RestaurantState, value: unknown, signed = false): RecipeLine[] {
  assert(Array.isArray(value) && value.length <= 100, "Informe uma ficha técnica válida");
  const aggregate = new Map<string, number>();
  for (const raw of value as Payload[]) {
    assert(raw && typeof raw === "object", "Ingrediente inválido");
    const stock = find(state.stockItems, raw.stockItemId, "Ingrediente");
    assert(stock.active, `O ingrediente ${stock.name} está inativo`);
    const amount = integer(
      raw.quantityMilli,
      "Quantidade do ingrediente",
      signed ? -1_000_000_000 : 1,
    );
    aggregate.set(stock.id, (aggregate.get(stock.id) ?? 0) + amount);
  }
  return [...aggregate]
    .filter(([, amount]) => amount !== 0)
    .map(([stockItemId, quantityMilli]) => ({ stockItemId, quantityMilli }));
}
function snapshotRecipe(
  state: RestaurantState,
  product: Product,
  selected: string[],
): StockSnapshot[] {
  const aggregate = new Map<string, number>();
  for (const line of [
    ...product.recipe,
    ...selected.flatMap((name) =>
      product.options.filter((option) => option.id === name).flatMap((option) => option.recipe),
    ),
  ])
    aggregate.set(line.stockItemId, (aggregate.get(line.stockItemId) ?? 0) + line.quantityMilli);
  return [...aggregate]
    .filter(([, amount]) => amount !== 0)
    .map(([stockItemId, quantityMilli]) => {
      assert(
        quantityMilli > 0,
        "As opções não podem remover mais ingredientes que a receita contém",
      );
      const stock = find(state.stockItems, stockItemId, "Ingrediente");
      assert(stock.active, `O ingrediente ${stock.name} está inativo`, 409);
      return { stockItemId, quantityMilli, unitCostMicros: stock.averageCostMicros };
    });
}
function stockCost(quantityMilli: number, costMicros: number): number {
  return Math.round((quantityMilli * costMicros) / 10_000_000);
}
function started(item: OrderItem) {
  return item.startedQuantity ?? (item.startedAt ? item.quantity : 0);
}
function ready(item: OrderItem) {
  return item.readyQuantity ?? (item.readyAt ? item.quantity : 0);
}
function delivered(item: OrderItem) {
  return item.deliveredQuantity ?? (item.deliveredAt ? item.quantity : 0);
}
function setProgress(item: OrderItem) {
  if (item.status === "cancelado" || item.status === "rascunho") return;
  item.status =
    delivered(item) >= item.quantity
      ? "entregue"
      : ready(item) >= item.quantity
        ? "pronto"
        : started(item) > 0
          ? "preparo"
          : "enviado";
}
function stationPermission(item: OrderItem, actor: Actor, delivering = false) {
  if (delivering) {
    roles(actor, ["garcom"]);
    return;
  }
  assert(
    actor.role === "gestor" ||
      actor.role === item.station ||
      (item.station === "direto" && actor.role === "garcom"),
    "Este item pertence a outra estação de produção",
    403,
  );
}
function moveProgress(
  state: RestaurantState,
  payload: Payload,
  ctx: CommandContext,
  action: string,
): CommandResult {
  const item = find(state.items, payload.itemId, "Item");
  openTab(state, item.tabId);
  assert(
    !["rascunho", "cancelado"].includes(item.status),
    "O item precisa ser enviado antes desta ação",
    409,
  );
  stationPermission(item, ctx.actor, action === "item.deliver");
  const currentStarted = started(item),
    currentReady = ready(item),
    currentDelivered = delivered(item);
  const available =
    action === "item.start"
      ? item.quantity - currentStarted
      : action === "item.ready"
        ? currentStarted - currentReady
        : currentReady - currentDelivered;
  assert(available > 0, "Não há unidades pendentes nesta etapa", 409);
  const amount = integer(payload.quantity ?? available, "Quantidade", 1, available);
  if (action === "item.start") {
    for (const line of item.recipe) {
      const stock = find(state.stockItems, line.stockItemId, "Ingrediente");
      const quantityMilli = line.quantityMilli * amount;
      assert(
        stock.quantityMilli >= stock.reservedMilli &&
          stock.quantityMilli >= quantityMilli &&
          stock.reservedMilli >= quantityMilli,
        `Estoque físico insuficiente de ${stock.name}. Resolva a divergência antes do preparo.`,
        409,
      );
    }
    for (const line of item.recipe) {
      const stock = find(state.stockItems, line.stockItemId, "Ingrediente");
      const quantityMilli = line.quantityMilli * amount;
      stock.quantityMilli -= quantityMilli;
      stock.reservedMilli -= quantityMilli;
      const cost =
        stockCost(line.quantityMilli * (currentStarted + amount), line.unitCostMicros) -
        stockCost(line.quantityMilli * currentStarted, line.unitCostMicros);
      item.costCents += cost;
      stockMovement(
        state,
        ctx,
        stock.id,
        "consumo",
        quantityMilli,
        `Preparo de ${item.name}`,
        item.id,
        cost,
      );
    }
    item.startedQuantity = currentStarted + amount;
    item.startedAt ??= ctx.now;
    if (item.station === "direto") {
      item.readyQuantity = currentReady + amount;
      item.readyAt = ctx.now;
    }
  } else if (action === "item.ready") {
    item.readyQuantity = currentReady + amount;
    item.readyAt = ctx.now;
  } else {
    item.deliveredQuantity = currentDelivered + amount;
    item.deliveredAt = ctx.now;
  }
  setProgress(item);
  return {
    entityId: item.id,
    message:
      action === "item.start"
        ? "Preparo iniciado e estoque baixado"
        : action === "item.ready"
          ? "Pedido pronto para servir"
          : "Entrega registrada",
  };
}

export function openVisit(
  state: RestaurantState,
  payload: Payload,
  ctx: CommandContext,
  allowedReservationId?: string,
): CommandResult {
  roles(ctx.actor, ["garcom", "caixa"]);
  const channel = text(payload.channel ?? "salao", "Canal");
  assert(["salao", "balcao", "retirada", "delivery"].includes(channel), "Canal inválido");
  const tableIds = payload.tableIds ? uniqueStrings(payload.tableIds, "Mesas") : [];
  if (channel === "salao") assert(tableIds.length > 0, "Selecione uma mesa");
  else assert(tableIds.length === 0, "Atendimento de outro canal não ocupa mesa");
  const people = integer(payload.people ?? 1, "Quantidade de pessoas", 1, 500);
  for (const tableId of tableIds) {
    const table = find(state.tables, tableId, "Mesa");
    assert(table.active, "Esta mesa está bloqueada", 409);
    assert(
      !state.occupancies.some((o) => o.tableId === table.id && !o.releasedAt),
      `Mesa ${table.number} já está ocupada`,
      409,
    );
    assert(
      !state.reservations.some(
        (r) =>
          r.id !== allowedReservationId &&
          r.status === "confirmada" &&
          r.tableIds.includes(table.id) &&
          r.startsAt <= ctx.now &&
          r.endsAt > ctx.now,
      ),
      `Mesa ${table.number} possui reserva neste horário. Registre a chegada pela reserva.`,
      409,
    );
  }
  const visitId = ctx.id();
  const fee =
    channel === "delivery"
      ? integer(payload.deliveryFeeCents ?? state.restaurant.deliveryFeeCents, "Taxa de entrega")
      : 0;
  const visit: Visit = {
    id: visitId,
    label: text(
      payload.label ||
        (tableIds.length
          ? `Mesa ${find(state.tables, tableIds[0], "Mesa").number}`
          : `Pedido ${channel}`),
      "Identificação",
    ),
    channel: channel as Visit["channel"],
    people,
    groupId: null,
    openedAt: ctx.now,
    closedAt: null,
    createdBy: ctx.actor.userId,
    customerName: text(
      payload.customerName,
      "Nome do cliente",
      channel === "delivery" || channel === "retirada",
    ),
    phone: text(payload.phone, "Telefone", channel === "delivery", 30),
    address: text(payload.address, "Endereço", channel === "delivery", 500),
    deliveryStatus: "aguardando",
    deliveryFeeCents: fee,
  };
  state.visits.push(visit);
  for (const tableId of tableIds)
    state.occupancies.push({ id: ctx.id(), tableId, visitId, openedAt: ctx.now, releasedAt: null });
  const tabId = ctx.id();
  state.tabs.push({
    id: tabId,
    visitId,
    label: visit.customerName || "Conta da mesa",
    status: "aberta",
    serviceRateBps: channel === "salao" ? state.restaurant.serviceRateBps : 0,
    discountCents: 0,
    extraCents: fee,
    openedAt: ctx.now,
    closedAt: null,
  });
  return { entityId: visitId, message: "Atendimento aberto" };
}

function applyOperational(
  state: RestaurantState,
  command: Command,
  ctx: CommandContext,
): CommandResult | null {
  const p = command.payload,
    action = command.action;
  if (action === "settings.update") {
    roles(ctx.actor, []);
    const changes = {
      name: text(p.name ?? state.restaurant.name, "Nome do restaurante", true, 120),
      address: text(p.address ?? state.restaurant.address, "Endereço", false, 500),
      phone: text(p.phone ?? state.restaurant.phone, "Telefone", false, 30),
      timezone: text(p.timezone ?? state.restaurant.timezone, "Fuso horário"),
      serviceRateBps: integer(
        p.serviceRateBps ?? state.restaurant.serviceRateBps,
        "Taxa de serviço",
        0,
        10000,
      ),
      reservationMinutes: integer(
        p.reservationMinutes ?? state.restaurant.reservationMinutes,
        "Duração da reserva",
        15,
        1440,
      ),
      deliveryFeeCents: integer(
        p.deliveryFeeCents ?? state.restaurant.deliveryFeeCents,
        "Taxa de entrega",
      ),
    };
    try {
      new Intl.DateTimeFormat("pt-BR", { timeZone: changes.timezone }).format();
    } catch {
      throw new AppError("Fuso horário inválido");
    }
    Object.assign(state.restaurant, changes);
    return { message: "Configurações atualizadas" };
  }
  if (action === "table.save") {
    roles(ctx.actor, []);
    const current = p.id ? find(state.tables, p.id, "Mesa") : null;
    const number = integer(p.number, "Número da mesa", 1, 9999);
    assert(
      !state.tables.some((t) => t.id !== current?.id && t.number === number),
      "Já existe uma mesa com esse número",
      409,
    );
    const next = {
      id: current?.id ?? ctx.id(),
      number,
      capacity: integer(p.capacity, "Capacidade", 1, 500),
      sector: text(p.sector ?? "Salão", "Setor", true, 60),
      active: bool(p.active),
    };
    assert(
      next.active || !state.occupancies.some((o) => o.tableId === next.id && !o.releasedAt),
      "Encerre o atendimento antes de bloquear a mesa",
      409,
    );
    if (current) Object.assign(current, next);
    else state.tables.push(next);
    return { entityId: next.id, message: "Mesa salva" };
  }
  if (action === "category.save") {
    roles(ctx.actor, []);
    const current = p.id ? find(state.categories, p.id, "Categoria") : null;
    const next = {
      id: current?.id ?? ctx.id(),
      name: text(p.name, "Nome", true, 80),
      active: bool(p.active),
    };
    assert(
      !state.categories.some(
        (c) => c.id !== current?.id && c.name.toLocaleLowerCase() === next.name.toLocaleLowerCase(),
      ),
      "Categoria já cadastrada",
      409,
    );
    if (current) Object.assign(current, next);
    else state.categories.push(next);
    return { entityId: next.id, message: "Categoria salva" };
  }
  if (action === "product.save") {
    roles(ctx.actor, []);
    const current = p.id ? find(state.products, p.id, "Produto") : null;
    const category = find(state.categories, p.categoryId, "Categoria");
    assert(category.active, "Categoria inativa");
    const recipe = recipeLines(state, p.recipe ?? []);
    const rawOptions = p.options ?? [];
    assert(Array.isArray(rawOptions) && rawOptions.length <= 30, "Opções inválidas");
    const options = (rawOptions as Payload[]).map((o) => ({
      id:
        typeof o.id === "string" && current?.options.some((old) => old.id === o.id)
          ? o.id
          : ctx.id(),
      name: text(o.name, "Nome da opção", true, 100),
      priceCents: integer(o.priceCents, "Preço da opção", -100000, 1000000),
      recipe: recipeLines(state, o.recipe ?? [], true),
    }));
    const imageUrl = text(p.imageUrl, "Foto", false, 2000) || null;
    assert(
      !imageUrl || imageUrl.startsWith("/api/files/") || /^https:\/\//.test(imageUrl),
      "Use uma imagem enviada ou um endereço HTTPS válido",
    );
    const station = text(p.station, "Estação");
    assert(["cozinha", "bar", "direto"].includes(station), "Estação inválida");
    const next: Product = {
      id: current?.id ?? ctx.id(),
      categoryId: category.id,
      name: text(p.name, "Nome do produto", true, 120),
      description: text(p.description, "Descrição", false, 500),
      priceCents: integer(p.priceCents, "Preço", 1, 10000000),
      station: station as Product["station"],
      active: bool(p.active),
      imageUrl,
      tag: text(p.tag, "Selo", false, 40),
      recipe,
      options,
      recipeVersion: (current?.recipeVersion ?? 0) + 1,
    };
    assert(
      !state.products.some(
        (product) =>
          product.id !== next.id &&
          product.active &&
          product.name.toLocaleLowerCase() === next.name.toLocaleLowerCase(),
      ),
      "Já existe um produto com este nome",
      409,
    );
    if (current) Object.assign(current, next);
    else state.products.push(next);
    return { entityId: next.id, message: "Produto e ficha técnica salvos" };
  }
  if (action === "stock.save") {
    roles(ctx.actor, []);
    const current = p.id ? find(state.stockItems, p.id, "Ingrediente") : null;
    const unit = text(p.unit, "Unidade");
    assert(["g", "ml", "un"].includes(unit), "Unidade inválida");
    assert(
      !current ||
        current.unit === unit ||
        (!current.quantityMilli &&
          !current.reservedMilli &&
          !state.stockMovements.some((m) => m.stockItemId === current.id) &&
          !state.items.some((i) => i.recipe.some((r) => r.stockItemId === current.id)) &&
          !state.products.some((product) =>
            [...product.recipe, ...product.options.flatMap((o) => o.recipe)].some(
              (r) => r.stockItemId === current.id,
            ),
          )),
      "Não altere a unidade de um item com histórico; cadastre um novo ingrediente",
      409,
    );
    const next: StockItem = {
      id: current?.id ?? ctx.id(),
      name: text(p.name, "Nome", true, 120),
      unit: unit as StockItem["unit"],
      quantityMilli: current?.quantityMilli ?? 0,
      reservedMilli: current?.reservedMilli ?? 0,
      minimumMilli: integer(p.minimumMilli ?? 0, "Estoque mínimo"),
      averageCostMicros: current?.averageCostMicros ?? 0,
      active: bool(p.active),
    };
    assert(next.active || next.reservedMilli === 0, "Este ingrediente possui reservas ativas", 409);
    if (current) Object.assign(current, next);
    else state.stockItems.push(next);
    return { entityId: next.id, message: "Item de estoque salvo" };
  }
  if (["stock.entry", "stock.adjust", "stock.loss"].includes(action)) {
    roles(ctx.actor, []);
    const stock = find(state.stockItems, p.stockItemId, "Item de estoque");
    const amount = integer(p.quantityMilli, "Quantidade", action === "stock.adjust" ? 0 : 1);
    const reason = text(p.reason, "Motivo", true, 500);
    if (action === "stock.entry") {
      const costCents = integer(p.costCents, "Custo total");
      const nextCostMicros = Math.round((costCents * 10000000) / amount);
      stock.averageCostMicros = Math.round(
        (stock.quantityMilli * stock.averageCostMicros + amount * nextCostMicros) /
          (stock.quantityMilli + amount),
      );
      stock.quantityMilli += amount;
      stockMovement(state, ctx, stock.id, "entrada", amount, reason, null, costCents);
    } else if (action === "stock.adjust") {
      const difference = amount - stock.quantityMilli;
      stock.quantityMilli = amount;
      stockMovement(state, ctx, stock.id, "ajuste", difference, reason);
    } else {
      assert(stock.quantityMilli >= amount, "A perda não pode exceder o saldo físico", 409);
      stock.quantityMilli -= amount;
      stockMovement(
        state,
        ctx,
        stock.id,
        "perda",
        amount,
        reason,
        null,
        stockCost(amount, stock.averageCostMicros),
      );
    }
    return {
      entityId: stock.id,
      message:
        stock.quantityMilli < stock.reservedMilli
          ? "Movimento registrado. Há reservas sem cobertura: reponha ou cancele pedidos afetados."
          : "Movimento de estoque registrado",
    };
  }
  if (action === "supplier.save") {
    roles(ctx.actor, []);
    const current = p.id ? find(state.suppliers, p.id, "Fornecedor") : null;
    const next = {
      id: current?.id ?? ctx.id(),
      name: text(p.name, "Nome", true, 120),
      phone: text(p.phone, "Telefone", false, 30),
      active: bool(p.active),
    };
    if (current) Object.assign(current, next);
    else state.suppliers.push(next);
    return { entityId: next.id, message: "Fornecedor salvo" };
  }
  if (action === "visit.open") return openVisit(state, p, ctx);
  if (action === "visit.update") {
    roles(ctx.actor, ["garcom", "caixa"]);
    const visit = activeVisit(state, p.visitId);
    if (p.people !== undefined) visit.people = integer(p.people, "Quantidade de pessoas", 0, 500);
    if (p.label !== undefined) visit.label = text(p.label, "Identificação");
    if (p.deliveryStatus !== undefined) {
      const status = text(p.deliveryStatus, "Situação da entrega");
      assert(["aguardando", "despachado", "entregue"].includes(status), "Situação inválida");
      assert(visit.channel === "delivery", "O atendimento não é delivery");
      if (status !== "aguardando")
        assert(
          state.items
            .filter(
              (i) =>
                state.tabs.some((t) => t.id === i.tabId && t.visitId === visit.id) &&
                i.status !== "cancelado",
            )
            .every((i) => ["pronto", "entregue"].includes(i.status)),
          "Conclua o preparo antes de despachar",
          409,
        );
      visit.deliveryStatus = status as Visit["deliveryStatus"];
    }
    return { entityId: visit.id, message: "Atendimento atualizado" };
  }
  if (action === "visit.transfer") {
    roles(ctx.actor, ["garcom"]);
    const visit = activeVisit(state, p.visitId);
    const table = find(state.tables, p.tableId, "Mesa");
    assert(
      table.active && !state.occupancies.some((o) => o.tableId === table.id && !o.releasedAt),
      "Mesa indisponível",
      409,
    );
    assert(
      !state.reservations.some(
        (r) =>
          r.status === "confirmada" &&
          r.tableIds.includes(table.id) &&
          r.startsAt <= ctx.now &&
          r.endsAt > ctx.now,
      ),
      "A mesa de destino possui reserva neste horário",
      409,
    );
    assert(visit.channel === "salao", "Este atendimento não ocupa mesa");
    for (const o of state.occupancies.filter((o) => o.visitId === visit.id && !o.releasedAt))
      o.releasedAt = ctx.now;
    state.occupancies.push({
      id: ctx.id(),
      visitId: visit.id,
      tableId: table.id,
      openedAt: ctx.now,
      releasedAt: null,
    });
    visit.label = `Mesa ${table.number}`;
    return { entityId: visit.id, message: "Atendimento transferido sem reenviar pedidos" };
  }
  if (action === "tab.create") {
    roles(ctx.actor, ["garcom", "caixa"]);
    const visit = activeVisit(state, p.visitId);
    const id = ctx.id();
    state.tabs.push({
      id,
      visitId: visit.id,
      label: text(p.label, "Nome da comanda", true, 80),
      status: "aberta",
      serviceRateBps: visit.channel === "salao" ? state.restaurant.serviceRateBps : 0,
      discountCents: 0,
      extraCents: 0,
      openedAt: ctx.now,
      closedAt: null,
    });
    return { entityId: id, message: "Comanda individual aberta" };
  }
  if (action === "item.add") {
    roles(ctx.actor, ["garcom", "caixa"]);
    const tab = openTab(state, p.tabId);
    const product = find(state.products, p.productId, "Produto");
    assert(product.active, "Este produto está pausado", 409);
    const amount = integer(p.quantity ?? 1, "Quantidade", 1, 999);
    const optionIds = p.optionIds ? uniqueStrings(p.optionIds, "Opções") : [];
    for (const id of optionIds)
      assert(
        product.options.some((o) => o.id === id),
        "Opção não pertence a este produto",
      );
    const price =
      product.priceCents +
      optionIds.reduce((sum, id) => sum + product.options.find((o) => o.id === id)!.priceCents, 0);
    assert(price > 0, "O preço final precisa ser positivo");
    const id = ctx.id();
    state.items.push({
      id,
      orderId: null,
      tabId: tab.id,
      productId: product.id,
      name: product.name,
      quantity: amount,
      unitPriceCents: price,
      status: "rascunho",
      station: product.station,
      notes: text(p.notes, "Observações", false, 500),
      options: optionIds,
      optionLabels: optionIds.map(
        (optionId) => product.options.find((option) => option.id === optionId)!.name,
      ),
      recipe: snapshotRecipe(state, product, optionIds),
      recipeVersion: product.recipeVersion,
      createdAt: ctx.now,
      sentAt: null,
      startedAt: null,
      readyAt: null,
      deliveredAt: null,
      cancelledAt: null,
      cancelReason: null,
      costCents: 0,
      startedQuantity: 0,
      readyQuantity: 0,
      deliveredQuantity: 0,
    });
    return { entityId: id, message: "Produto adicionado à comanda" };
  }
  if (action === "item.quantity") {
    roles(ctx.actor, ["garcom", "caixa"]);
    const item = find(state.items, p.itemId, "Item");
    openTab(state, item.tabId);
    assert(item.status === "rascunho", "Itens enviados precisam de cancelamento autorizado", 409);
    const amount = integer(p.quantity, "Quantidade", 0, 999);
    if (amount === 0) {
      item.status = "cancelado";
      item.cancelledAt = ctx.now;
      item.cancelReason = "Removido do rascunho";
    } else item.quantity = amount;
    return {
      entityId: item.id,
      message: amount === 0 ? "Item removido do rascunho" : "Quantidade atualizada",
    };
  }
  if (action === "order.send") {
    roles(ctx.actor, ["garcom", "caixa"]);
    const tabIds = uniqueStrings(p.tabIds, "Comandas");
    assert(tabIds.length > 0, "Selecione uma comanda");
    for (const id of tabIds) openTab(state, id);
    const items = state.items.filter((i) => tabIds.includes(i.tabId) && i.status === "rascunho");
    assert(items.length > 0, "Não há itens novos para enviar", 409);
    const needed = new Map<string, number>();
    for (const item of items) {
      const product = find(state.products, item.productId, "Produto");
      assert(
        product.active &&
          state.categories.some(
            (category) => category.id === product.categoryId && category.active,
          ),
        `${product.name} ou sua categoria foi pausado. Remova ou substitua o item.`,
        409,
      );
      assert(
        item.options.every((id) => product.options.some((option) => option.id === id)),
        `Uma opção de ${item.name} foi removida. Revise o item antes do envio.`,
        409,
      );
      item.recipe = snapshotRecipe(state, product, item.options);
      item.recipeVersion = product.recipeVersion;
      item.station = product.station;
      for (const line of item.recipe)
        needed.set(
          line.stockItemId,
          (needed.get(line.stockItemId) ?? 0) + line.quantityMilli * item.quantity,
        );
    }
    for (const [id, amount] of needed) {
      const stock = find(state.stockItems, id, "Ingrediente");
      assert(
        stock.quantityMilli - stock.reservedMilli >= amount,
        `Estoque insuficiente de ${stock.name}. Disponível: ${((stock.quantityMilli - stock.reservedMilli) / 1000).toLocaleString("pt-BR")} ${stock.unit}.`,
        409,
      );
    }
    const orderIds = new Map<string, string>();
    for (const item of items) {
      const tab = find(state.tabs, item.tabId, "Comanda");
      let orderId = orderIds.get(tab.visitId);
      if (!orderId) {
        orderId = ctx.id();
        state.orders.push({
          id: orderId,
          visitId: tab.visitId,
          createdAt: ctx.now,
          createdBy: ctx.actor.userId,
        });
        orderIds.set(tab.visitId, orderId);
      }
      item.orderId = orderId;
      item.status = "enviado";
      item.sentAt = ctx.now;
      for (const line of item.recipe) {
        const stock = find(state.stockItems, line.stockItemId, "Ingrediente");
        const amount = line.quantityMilli * item.quantity;
        stock.reservedMilli += amount;
        stockMovement(state, ctx, stock.id, "reserva", amount, `Envio de ${item.name}`, item.id);
      }
    }
    return { entityId: [...orderIds.values()][0], message: "Pedido enviado; estoque reservado" };
  }
  if (["item.start", "item.ready", "item.deliver"].includes(action))
    return moveProgress(state, p, ctx, action);
  if (action === "item.cancel") {
    const item = find(state.items, p.itemId, "Item");
    openTab(state, item.tabId);
    assert(item.status !== "cancelado", "Item já cancelado", 409);
    roles(ctx.actor, item.status === "rascunho" ? ["garcom", "caixa"] : []);
    const reason = text(p.reason, "Motivo do cancelamento", true, 500);
    const amount = integer(p.quantity ?? item.quantity, "Quantidade", 1, item.quantity);
    const wasSent = item.status !== "rascunho";
    let cancelledId = item.id;
    const previousQuantity = item.quantity;
    const previousStarted = started(item);
    const unstarted = previousQuantity - previousStarted;
    const releasing = Math.min(amount, unstarted);
    const consumed = amount - releasing;
    let cancelledCost = 0;
    for (const line of item.recipe) {
      const stock = find(state.stockItems, line.stockItemId, "Ingrediente");
      if (item.status !== "rascunho" && releasing) {
        const released = line.quantityMilli * releasing;
        assert(stock.reservedMilli >= released, "Reserva de estoque inconsistente", 409);
        stock.reservedMilli -= released;
        stockMovement(state, ctx, stock.id, "liberacao", released, reason, item.id);
      }
      if (consumed) {
        const cost =
          stockCost(line.quantityMilli * previousStarted, line.unitCostMicros) -
          stockCost(line.quantityMilli * (previousStarted - consumed), line.unitCostMicros);
        cancelledCost += cost;
        stockMovement(
          state,
          ctx,
          stock.id,
          "perda",
          0,
          `${reason} · ${(line.quantityMilli * consumed) / 1000} ${stock.unit} já consumidos`,
          item.id,
          cost,
        );
      }
    }
    if (amount === previousQuantity) {
      item.status = "cancelado";
      item.cancelledAt = ctx.now;
      item.cancelReason = reason;
    } else {
      const cancelled = {
        ...item,
        id: ctx.id(),
        quantity: amount,
        status: "cancelado" as ItemStatus,
        cancelledAt: ctx.now,
        cancelReason: reason,
        startedQuantity: consumed,
        readyQuantity: 0,
        deliveredQuantity: 0,
        costCents: cancelledCost,
      };
      const newQty = previousQuantity - amount;
      const nextStarted = started(item) - consumed;
      const nextReady = Math.min(ready(item), nextStarted);
      const nextDelivered = Math.min(delivered(item), nextReady);
      item.quantity = newQty;
      item.startedQuantity = nextStarted;
      item.readyQuantity = nextReady;
      item.deliveredQuantity = nextDelivered;
      item.costCents = Math.max(0, item.costCents - cancelled.costCents);
      setProgress(item);
      state.items.push(cancelled);
      cancelledId = cancelled.id;
    }
    if (wasSent) {
      const tab = find(state.tabs, item.tabId, "Comanda");
      state.calls.push({
        id: ctx.id(),
        visitId: tab.visitId,
        destination: item.station === "direto" ? "salao" : item.station,
        message: `Cancelado: ${amount}x ${item.name}. Motivo: ${reason}`,
        status: "aberto",
        createdAt: ctx.now,
        createdBy: ctx.actor.userId,
        kind: "cancelamento",
        itemId: cancelledId,
        quantity: amount,
        actorName: ctx.actor.name,
      });
    }
    return {
      entityId: item.id,
      message: consumed
        ? "Cancelamento registrado com perda do que já começou a ser preparado"
        : "Cancelamento registrado; reserva liberada",
    };
  }
  return null;
}

function applyScheduling(
  state: RestaurantState,
  command: Command,
  ctx: CommandContext,
): CommandResult | null {
  const p = command.payload;
  if (command.action === "reservation.save") {
    roles(ctx.actor, ["garcom", "caixa"]);
    const current = p.id ? find(state.reservations, p.id, "Reserva") : null;
    assert(
      !current || current.status === "confirmada",
      "Esta reserva não pode mais ser editada",
      409,
    );
    const startsAt = iso(p.startsAt, "Início"),
      endsAt = iso(p.endsAt, "Fim");
    assert(endsAt > startsAt, "O fim deve ser posterior ao início");
    const people = integer(p.people, "Pessoas", 1, 500);
    const tableIds = uniqueStrings(p.tableIds ?? [], "Mesas");
    let capacity = 0;
    for (const tableId of tableIds) {
      const table = find(state.tables, tableId, "Mesa");
      assert(table.active, "Mesa bloqueada");
      capacity += table.capacity;
      assert(
        !state.reservations.some(
          (r) =>
            r.id !== current?.id &&
            r.status === "confirmada" &&
            r.tableIds.includes(tableId) &&
            r.startsAt < endsAt &&
            r.endsAt > startsAt,
        ),
        `Mesa ${table.number} já possui reserva nesse intervalo`,
        409,
      );
    }
    assert(
      !tableIds.length || capacity >= people,
      "As mesas não comportam o número informado de pessoas",
    );
    const next = {
      id: current?.id ?? ctx.id(),
      customerName: text(p.customerName, "Cliente", true, 120),
      phone: text(p.phone, "Telefone", false, 30),
      people,
      tableIds,
      startsAt,
      endsAt,
      notes: text(p.notes, "Observação", false, 500),
      status: "confirmada" as const,
      visitId: null,
    };
    if (current) Object.assign(current, next);
    else state.reservations.push(next);
    return { entityId: next.id, message: "Reserva salva" };
  }
  if (command.action === "reservation.status") {
    roles(ctx.actor, ["garcom", "caixa"]);
    const reservation = find(state.reservations, p.reservationId, "Reserva");
    const status = text(p.status, "Situação");
    assert(
      ["confirmada", "cancelada", "ausente"].includes(status),
      "Use o check-in para registrar chegada",
    );
    assert(reservation.status !== "chegou", "A reserva já gerou atendimento", 409);
    if (status === "confirmada")
      for (const tableId of reservation.tableIds) {
        const table = find(state.tables, tableId, "Mesa");
        assert(table.active, "Mesa bloqueada");
        assert(
          !state.reservations.some(
            (r) =>
              r.id !== reservation.id &&
              r.status === "confirmada" &&
              r.tableIds.includes(tableId) &&
              r.startsAt < reservation.endsAt &&
              r.endsAt > reservation.startsAt,
          ),
          "Já existe outra reserva neste intervalo",
          409,
        );
      }
    reservation.status = status as "confirmada" | "cancelada" | "ausente";
    return { entityId: reservation.id, message: "Reserva atualizada" };
  }
  if (command.action === "reservation.checkin") {
    roles(ctx.actor, ["garcom", "caixa"]);
    const reservation = find(state.reservations, p.reservationId, "Reserva");
    assert(reservation.status === "confirmada", "Esta reserva não está aguardando chegada", 409);
    const tableIds = p.tableId ? [String(p.tableId)] : reservation.tableIds;
    const result = openVisit(
      state,
      {
        tableIds,
        channel: "salao",
        people: reservation.people,
        customerName: reservation.customerName,
        phone: reservation.phone,
      },
      ctx,
      reservation.id,
    );
    reservation.status = "chegou";
    reservation.visitId = result.entityId!;
    return { entityId: result.entityId, message: "Chegada confirmada e atendimento aberto" };
  }
  if (command.action === "waitlist.add") {
    roles(ctx.actor, ["garcom", "caixa"]);
    const id = ctx.id();
    state.waitlist.push({
      id,
      customerName: text(p.customerName, "Cliente", true, 120),
      phone: text(p.phone, "Telefone", false, 30),
      people: integer(p.people, "Pessoas", 1, 500),
      createdAt: ctx.now,
      status: "aguardando",
      visitId: null,
    });
    return { entityId: id, message: "Cliente incluído na fila" };
  }
  if (command.action === "waitlist.status") {
    roles(ctx.actor, ["garcom", "caixa"]);
    const wait = find(state.waitlist, p.waitId, "Entrada da fila");
    const status = text(p.status, "Situação");
    assert(
      ["aguardando", "chamado", "cancelado"].includes(status),
      "Use acomodar para iniciar o atendimento",
    );
    assert(wait.status !== "atendido", "Cliente já atendido", 409);
    wait.status = status as "aguardando" | "chamado" | "cancelado";
    return { entityId: wait.id, message: "Fila atualizada" };
  }
  if (command.action === "waitlist.seat") {
    roles(ctx.actor, ["garcom", "caixa"]);
    const wait = find(state.waitlist, p.waitId, "Entrada da fila");
    assert(["aguardando", "chamado"].includes(wait.status), "Cliente não está aguardando", 409);
    const result = openVisit(
      state,
      {
        tableIds: [p.tableId],
        channel: "salao",
        people: wait.people,
        customerName: wait.customerName,
        phone: wait.phone,
      },
      ctx,
    );
    wait.status = "atendido";
    wait.visitId = result.entityId!;
    return { entityId: result.entityId, message: "Cliente acomodado" };
  }
  if (command.action === "call.create") {
    roles(ctx.actor, ["garcom", "caixa", "cozinha", "bar"]);
    const destination = text(p.destination, "Destino");
    assert(["cozinha", "bar", "salao"].includes(destination), "Destino inválido");
    if (p.visitId) activeVisit(state, p.visitId);
    const id = ctx.id();
    state.calls.push({
      id,
      visitId: p.visitId ? String(p.visitId) : null,
      destination: destination as "cozinha" | "bar" | "salao",
      message: text(p.message, "Mensagem", true, 500),
      status: "aberto",
      createdAt: ctx.now,
      createdBy: ctx.actor.userId,
    });
    return { entityId: id, message: "Chamado enviado à equipe" };
  }
  if (command.action === "call.status") {
    const call = find(state.calls, p.callId, "Chamado");
    assert(
      ctx.actor.role === "gestor" ||
        ctx.actor.role === call.destination ||
        (call.destination === "salao" && ["garcom", "caixa"].includes(ctx.actor.role)),
      "O chamado pertence a outra equipe",
      403,
    );
    const status = text(p.status, "Situação");
    assert(["atendido", "concluido"].includes(status), "Situação inválida");
    call.status = status as "atendido" | "concluido";
    return { entityId: call.id, message: "Chamado atualizado" };
  }
  return null;
}

export function applyCommand(
  state: RestaurantState,
  command: Command,
  ctx: CommandContext,
): CommandResult {
  assert(
    command &&
      typeof command.action === "string" &&
      command.payload &&
      typeof command.payload === "object" &&
      !Array.isArray(command.payload),
    "Comando inválido",
  );
  assert(state.restaurant.id === ctx.actor.restaurantId, "Restaurante inválido", 403);
  const previousAssociations = command.action.startsWith("group.")
    ? state.visits
        .filter((v) => !v.closedAt)
        .map((v) => ({
          visitId: v.id,
          groupId: v.groupId,
          tableIds: state.occupancies
            .filter((o) => o.visitId === v.id && !o.releasedAt)
            .map((o) => o.tableId),
        }))
    : undefined;
  const result =
    applyOperational(state, command, ctx) ??
    applyScheduling(state, command, ctx) ??
    applyFinanceCommand(state, command, ctx);
  assert(result, "Operação não reconhecida", 400);
  const safePayload = Object.fromEntries(
    Object.entries(command.payload).filter(([key]) => !/password|senha|token|secret/i.test(key)),
  );
  state.audits.push({
    id: ctx.id(),
    action: command.action,
    entityId: result.entityId ?? null,
    detail: JSON.stringify({ message: result.message, payload: safePayload, previousAssociations }),
    createdAt: ctx.now,
    createdBy: ctx.actor.userId,
    actorName: ctx.actor.name,
  });
  return result;
}
