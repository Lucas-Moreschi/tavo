import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type {
  Actor,
  AppSnapshot,
  Command,
  CommandContext,
  CommandResult,
  Restaurant,
  RestaurantState,
} from "@/domain/types";
import { AppError } from "@/shared/lib/errors";
import { getPool, transaction } from "@/server/db";
import { getProfile, getTeam, requireActor } from "@/server/access";

export const collections = {
  tables: "dining_tables",
  groups: "table_groups",
  visits: "visits",
  occupancies: "occupancies",
  tabs: "tabs",
  categories: "categories",
  stockItems: "stock_items",
  products: "products",
  cashSessions: "cash_sessions",
  orders: "orders",
  items: "order_items",
  stockMovements: "stock_movements",
  payments: "payments",
  refunds: "refunds",
  cashMovements: "cash_movements",
  reservations: "reservations",
  waitlist: "waitlist",
  calls: "service_calls",
  audits: "audit_events",
  suppliers: "suppliers",
} as const;
type Collection = keyof typeof collections;
export function emptyState(restaurant: Restaurant): RestaurantState {
  return Object.assign(
    { restaurant },
    Object.fromEntries(Object.keys(collections).map((key) => [key, []])),
  ) as unknown as RestaurantState;
}
export async function loadState(
  client: PoolClient,
  restaurantId: string,
): Promise<{ state: RestaurantState; version: number }> {
  const restaurant = await client.query("SELECT body,version FROM restaurants WHERE id=$1", [
    restaurantId,
  ]);
  if (!restaurant.rows[0]) throw new AppError("Restaurante não encontrado.", 404, "NOT_FOUND");
  const rows = await client.query(
    Object.entries(collections)
      .map(
        ([key, table]) =>
          `SELECT '${key}' AS collection,COALESCE(jsonb_agg(body ORDER BY id),'[]'::jsonb) AS data FROM ${table} WHERE restaurant_id=$1`,
      )
      .join(" UNION ALL "),
    [restaurantId],
  );
  const state = emptyState(restaurant.rows[0].body);
  for (const row of rows.rows) (state[row.collection as Collection] as unknown[]) = row.data;
  state.tables.sort((a, b) => a.number - b.number);
  state.categories.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  state.products.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  state.stockItems.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  for (const key of [
    "visits",
    "tabs",
    "orders",
    "items",
    "stockMovements",
    "payments",
    "refunds",
    "cashSessions",
    "cashMovements",
    "waitlist",
    "calls",
    "audits",
  ] as const) {
    const values = state[key] as unknown as Record<string, unknown>[];
    values.sort(
      (a, b) =>
        String(a.createdAt || a.openedAt || "").localeCompare(
          String(b.createdAt || b.openedAt || ""),
        ) || String(a.id).localeCompare(String(b.id)),
    );
  }
  return { state, version: restaurant.rows[0].version };
}
async function replaceEdges(
  client: PoolClient,
  tenant: string,
  table: string,
  columns: string[],
  rows: Record<string, unknown>[],
) {
  await client.query(`DELETE FROM ${table} WHERE restaurant_id=$1`, [tenant]);
  if (!rows.length) return;
  const types: Record<string, string> = {
    position: "integer",
    quantity_milli: "bigint",
    amount_cents: "bigint",
  };
  await client.query(
    `INSERT INTO ${table}(restaurant_id,${columns.join(",")}) SELECT $1,${columns.join(",")} FROM jsonb_to_recordset($2::jsonb) AS x(${columns.map((column) => `${column} ${types[column] || "text"}`).join(",")})`,
    [tenant, JSON.stringify(rows)],
  );
}
export async function saveState(
  client: PoolClient,
  state: RestaurantState,
  previous?: RestaurantState,
) {
  const tenant = state.restaurant.id;
  await client.query("SET CONSTRAINTS ALL DEFERRED");
  if (!previous || JSON.stringify(previous.restaurant) !== JSON.stringify(state.restaurant))
    await client.query("UPDATE restaurants SET body=$1::jsonb,slug=$2 WHERE id=$3", [
      JSON.stringify(state.restaurant),
      state.restaurant.slug,
      tenant,
    ]);
  const changed = new Set<Collection>();
  for (const [key, table] of Object.entries(collections) as [Collection, string][]) {
    const list = state[key];
    if (previous && JSON.stringify(previous[key]) === JSON.stringify(list)) continue;
    changed.add(key);
    await client.query(`DELETE FROM ${table} WHERE restaurant_id=$1 AND NOT(id=ANY($2::text[]))`, [
      tenant,
      list.map((entity) => entity.id),
    ]);
    if (list.length)
      await client.query(
        `INSERT INTO ${table}(restaurant_id,id,body) SELECT $1,entry->>'id',entry FROM jsonb_array_elements($2::jsonb) entry ON CONFLICT(restaurant_id,id) DO UPDATE SET body=EXCLUDED.body WHERE ${table}.body IS DISTINCT FROM EXCLUDED.body`,
        [tenant, JSON.stringify(list)],
      );
  }
  if (changed.has("products")) {
    const rows: Record<string, unknown>[] = [];
    for (const product of state.products) {
      product.recipe.forEach((line, index) =>
        rows.push({
          product_id: product.id,
          component_key: `base:${index}`,
          stock_item_id: line.stockItemId,
          quantity_milli: line.quantityMilli,
        }),
      );
      for (const option of product.options)
        option.recipe.forEach((line, index) =>
          rows.push({
            product_id: product.id,
            component_key: `${option.id}:${index}`,
            stock_item_id: line.stockItemId,
            quantity_milli: line.quantityMilli,
          }),
        );
    }
    await replaceEdges(
      client,
      tenant,
      "recipe_components",
      ["product_id", "component_key", "stock_item_id", "quantity_milli"],
      rows,
    );
  }
  if (changed.has("items"))
    await replaceEdges(
      client,
      tenant,
      "item_recipe_components",
      ["item_id", "component_key", "stock_item_id", "quantity_milli"],
      state.items.flatMap((item) =>
        item.recipe.map((line, index) => ({
          item_id: item.id,
          component_key: String(index),
          stock_item_id: line.stockItemId,
          quantity_milli: line.quantityMilli,
        })),
      ),
    );
  if (changed.has("payments"))
    await replaceEdges(
      client,
      tenant,
      "payment_allocations",
      ["payment_id", "position", "tab_id", "item_id", "amount_cents"],
      state.payments.flatMap((payment) =>
        payment.allocations.map((line, index) => ({
          payment_id: payment.id,
          position: index,
          tab_id: line.tabId,
          item_id: line.itemId || null,
          amount_cents: line.amountCents,
        })),
      ),
    );
  if (changed.has("refunds"))
    await replaceEdges(
      client,
      tenant,
      "refund_allocations",
      ["refund_id", "position", "tab_id", "item_id", "amount_cents"],
      state.refunds.flatMap((refund) =>
        refund.allocations.map((line, index) => ({
          refund_id: refund.id,
          position: index,
          tab_id: line.tabId,
          item_id: line.itemId || null,
          amount_cents: line.amountCents,
        })),
      ),
    );
  if (changed.has("reservations"))
    await replaceEdges(
      client,
      tenant,
      "reservation_tables",
      ["reservation_id", "table_id"],
      state.reservations.flatMap((reservation) =>
        reservation.tableIds.map((tableId) => ({
          reservation_id: reservation.id,
          table_id: tableId,
        })),
      ),
    );
}
export function restrictState(state: RestaurantState, actor: Actor): RestaurantState {
  const view = structuredClone(state);
  if (actor.role === "gestor") return view;
  if (actor.role === "caixa") {
    view.stockItems = [];
    view.stockMovements = [];
    view.suppliers = [];
    view.audits = [];
    view.products = view.products.map((product) => ({
      ...product,
      recipe: [],
      options: product.options.map((option) => ({ ...option, recipe: [] })),
    }));
    view.items = view.items.map((item) => ({ ...item, recipe: [], costCents: 0 }));
    return view;
  }
  view.stockItems = [];
  view.stockMovements = [];
  view.suppliers = [];
  view.audits = [];
  view.cashSessions = [];
  view.cashMovements = [];
  view.products = view.products.map((product) => ({
    ...product,
    recipe: [],
    options: product.options.map((option) => ({ ...option, recipe: [] })),
  }));
  view.items = view.items.map((item) => ({ ...item, recipe: [], costCents: 0 }));
  if (actor.role === "cozinha" || actor.role === "bar") {
    view.items = view.items
      .filter((item) => item.station === actor.role && item.status !== "rascunho")
      .map((item) => ({ ...item, unitPriceCents: 0 }));
    const tabIds = new Set(view.items.map((item) => item.tabId));
    const orderIds = new Set(view.items.map((item) => item.orderId));
    view.tabs = view.tabs
      .filter((tab) => tabIds.has(tab.id))
      .map((tab) => ({ ...tab, serviceRateBps: 0, discountCents: 0, extraCents: 0 }));
    const visitIds = new Set(view.tabs.map((tab) => tab.visitId));
    view.visits = view.visits
      .filter((visit) => visitIds.has(visit.id))
      .map((visit) => ({ ...visit, phone: "", address: "", deliveryFeeCents: 0 }));
    view.orders = view.orders.filter((order) => orderIds.has(order.id));
    view.occupancies = view.occupancies.filter((occupancy) => visitIds.has(occupancy.visitId));
    view.products = [];
    view.categories = [];
    view.payments = [];
    view.refunds = [];
    view.reservations = [];
    view.waitlist = [];
    view.calls = view.calls.filter((call) => call.destination === actor.role);
    view.restaurant.serviceRateBps = 0;
    view.restaurant.deliveryFeeCents = 0;
  } else {
    // O histórico operacional de comandas precisa manter o saldo também após fechar.
    // Detalhes de caixa e referências externas não são necessários ao atendimento.
    view.payments = view.payments.map((payment) => ({
      ...payment,
      cashSessionId: "",
      amountCents: payment.allocations.reduce((sum, line) => sum + line.amountCents, 0),
      tenderedCents: 0,
      changeCents: 0,
      reference: "",
    }));
    view.refunds = view.refunds.map((refund) => ({
      ...refund,
      cashSessionId: "",
      amountCents: refund.allocations.reduce((sum, line) => sum + line.amountCents, 0),
      reason: "",
    }));
  }
  return view;
}
async function buildSnapshot(
  client: PoolClient,
  actor: Actor,
  state: RestaurantState,
  version: number,
): Promise<AppSnapshot> {
  return {
    ...restrictState(state, actor),
    actor,
    profile: await getProfile(actor, client),
    team: await getTeam(actor, client),
    version,
  };
}
export async function getSnapshot(headers: Headers): Promise<AppSnapshot> {
  const actor = await requireActor(headers, true);
  const client = await getPool().connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const { state, version } = await loadState(client, actor.restaurantId);
    const snapshot = await buildSnapshot(client, actor, state, version);
    await client.query("COMMIT");
    return snapshot;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => [key, canonical(entry)]),
    );
  return value;
}
export type CommandReducer = (
  state: RestaurantState,
  command: Command,
  context: CommandContext,
) => CommandResult | Promise<CommandResult>;
export async function getOperationResult(headers: Headers, operationId: string) {
  const actor = await requireActor(headers);
  if (!operationId || operationId.length > 128)
    throw new AppError("Identificador de operação inválido.");
  const found = await getPool().query(
    "SELECT result FROM operation_results WHERE restaurant_id=$1 AND operation_id=$2 AND user_id=$3",
    [actor.restaurantId, operationId, actor.userId],
  );
  return found.rows[0]
    ? {
        found: true,
        result: found.rows[0].result as CommandResult,
        snapshot: await getSnapshot(headers),
      }
    : { found: false };
}
export async function runCommand(headers: Headers, command: Command, reducer: CommandReducer) {
  const actor = await requireActor(headers);
  if (
    typeof command.operationId !== "string" ||
    !command.operationId ||
    command.operationId.length > 128 ||
    typeof command.action !== "string" ||
    !command.action ||
    command.action.length > 100 ||
    !command.payload ||
    typeof command.payload !== "object" ||
    Array.isArray(command.payload) ||
    (command.expectedVersion !== undefined &&
      (!Number.isSafeInteger(command.expectedVersion) || command.expectedVersion < 0))
  )
    throw new AppError("Comando inválido.");
  const hash = createHash("sha256")
    .update(JSON.stringify(canonical({ action: command.action, payload: command.payload })))
    .digest("hex");
  return transaction(async (client) => {
    await client.query("SELECT id FROM restaurants WHERE id=$1 FOR UPDATE", [actor.restaurantId]);
    const current = await client.query(
      'SELECT m.role,m.active,(m.must_change_password OR u.credential_temporary) AS must_change_password,u.name FROM memberships m JOIN "user" u ON u.id=m.user_id WHERE m.id=$1 AND m.restaurant_id=$2 AND m.user_id=$3',
      [actor.memberId, actor.restaurantId, actor.userId],
    );
    if (!current.rows[0]?.active)
      throw new AppError("Seu acesso foi desativado.", 403, "FORBIDDEN");
    if (current.rows[0].must_change_password)
      throw new AppError("Troque a senha provisória para operar.", 403, "PASSWORD_CHANGE_REQUIRED");
    actor.role = current.rows[0].role;
    actor.name = current.rows[0].name;
    const prior = await client.query(
      "SELECT user_id,payload_hash,result FROM operation_results WHERE restaurant_id=$1 AND operation_id=$2",
      [actor.restaurantId, command.operationId],
    );
    const loaded = await loadState(client, actor.restaurantId);
    if (prior.rows[0]) {
      if (prior.rows[0].user_id !== actor.userId || prior.rows[0].payload_hash !== hash)
        throw new AppError(
          "Este identificador já foi usado em outra operação.",
          409,
          "OPERATION_CONFLICT",
        );
      return {
        snapshot: await buildSnapshot(client, actor, loaded.state, loaded.version),
        result: prior.rows[0].result as CommandResult,
        replayed: true,
      };
    }
    if (command.expectedVersion !== undefined && command.expectedVersion !== loaded.version)
      throw new AppError(
        "Os dados mudaram em outro dispositivo. Atualize a tela antes de confirmar.",
        409,
        "VERSION_CONFLICT",
      );
    const previous = structuredClone(loaded.state);
    const result = await reducer(loaded.state, command, {
      actor,
      now: new Date().toISOString(),
      id: randomUUID,
    });
    await saveState(client, loaded.state, previous);
    const version = loaded.version + 1;
    await client.query("UPDATE restaurants SET version=$1 WHERE id=$2", [
      version,
      actor.restaurantId,
    ]);
    await client.query(
      "INSERT INTO operation_results(restaurant_id,operation_id,user_id,payload_hash,result) VALUES($1,$2,$3,$4,$5::jsonb)",
      [actor.restaurantId, command.operationId, actor.userId, hash, JSON.stringify(result)],
    );
    return {
      snapshot: await buildSnapshot(client, actor, loaded.state, version),
      result,
      replayed: false,
    };
  });
}
