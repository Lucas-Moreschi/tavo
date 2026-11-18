import { randomUUID } from "node:crypto";
import { applyCommand } from "../../src/domain/commands";
import { cashExpected, tabTotals } from "../../src/domain/finance";
import type { Actor, Channel, RestaurantState, Role } from "../../src/domain/types";

export type PresentationActors = Record<Role, Actor>;
export const PRESENTATION_OPERATION = "seed-demo:tavo-demo:v1";

/** Use as mesmas regras da aplicação; o chamador garante transação e execução única. */
export function populatePresentation(
  state: RestaurantState,
  actors: PresentationActors,
  now = new Date(),
  id: () => string = randomUUID,
) {
  if (state.restaurant.slug !== "tavo-demo")
    throw new Error("Esta carga é exclusiva do restaurante tavo-demo.");
  if (state.cashSessions.some((cash) => !cash.closedAt))
    throw new Error(
      "O TAVO já tem um caixa aberto. Feche-o pela aplicação antes da primeira carga; nenhum registro foi alterado.",
    );
  const before = structuredClone(state);
  let clock = now.getTime();
  const at = (time: number) => {
    clock = time;
  };
  const run = (action: string, payload: Record<string, unknown>, role: Role = "gestor") =>
    applyCommand(
      state,
      { action, payload, operationId: id() },
      { actor: actors[role], now: new Date(clock).toISOString(), id },
    );
  const entity = (action: string, payload: Record<string, unknown>, role?: Role) => {
    const result = run(action, payload, role).entityId;
    if (!result) throw new Error(`A operação ${action} não retornou identificador.`);
    return result;
  };
  const minute = 60_000;
  const ago = (minutes: number) => now.getTime() - minutes * minute;
  at(ago(7 * 1440));
  const category = (name: string) =>
    state.categories.find((entry) => entry.name === name && entry.active)?.id ??
    entity("category.save", { name, active: true });
  const stock = (
    name: string,
    unit: "g" | "ml" | "un",
    amount: number,
    cost: number,
    minimum: number,
  ) => {
    const existing = state.stockItems.find((entry) => entry.name === name && entry.active);
    if (existing) return existing.id;
    const stockItemId = entity("stock.save", { name, unit, minimumMilli: minimum, active: true });
    run("stock.entry", {
      stockItemId,
      quantityMilli: amount,
      costCents: cost,
      reason: "Compra para o cenário de demonstração",
    });
    return stockItemId;
  };
  const appetizer = category("Entradas e acompanhamentos");
  const cafeteria = category("Cafeteria");
  const specials = category("Especiais");
  const beverages = category("Bebidas"),
    desserts = category("Sobremesas"),
    dishes = category("Pratos");
  const potatoes = stock("Batata rústica", "g", 20_000_000, 14000, 2_000_000);
  const leaves = stock("Mix de folhas", "g", 2_500_000, 6500, 300_000);
  const tomatoes = stock("Tomate cereja", "g", 5_000_000, 8000, 500_000);
  const soda = stock("Refrigerante lata", "un", 60_000, 21000, 12_000);
  const juice = stock("Suco natural de laranja", "ml", 15_000_000, 18000, 2_000_000);
  const coffee = stock("Café em grãos", "g", 180_000, 1800, 250_000);
  const brownie = stock("Brownie pronto", "un", 30_000, 12000, 5_000);
  const iceCream = stock("Porção de sorvete", "un", 40_000, 8000, 5_000);
  const addProduct = (
    name: string,
    categoryId: string,
    priceCents: number,
    station: string,
    description: string,
    recipe: { stockItemId: string; quantityMilli: number }[],
    active = true,
    tag = "",
  ) => {
    const existing = state.products.find((entry) => entry.name === name);
    if (existing) return existing.id;
    return entity("product.save", {
      name,
      categoryId,
      priceCents,
      station,
      description,
      recipe,
      active,
      tag,
      options: [],
    });
  };
  addProduct(
    "Batata rústica da casa",
    appetizer,
    1800,
    "cozinha",
    "Batatas douradas com ervas e sal da casa",
    [{ stockItemId: potatoes, quantityMilli: 200_000 }],
    true,
    "PARA COMPARTILHAR",
  );
  addProduct("Salada da horta", dishes, 2400, "cozinha", "Folhas frescas e tomate cereja", [
    { stockItemId: leaves, quantityMilli: 80_000 },
    { stockItemId: tomatoes, quantityMilli: 80_000 },
  ]);
  addProduct("Refrigerante lata", beverages, 800, "direto", "Lata de 350 ml", [
    { stockItemId: soda, quantityMilli: 1000 },
  ]);
  addProduct("Suco de laranja", beverages, 1200, "bar", "Suco natural, copo de 300 ml", [
    { stockItemId: juice, quantityMilli: 300_000 },
  ]);
  addProduct(
    "Café espresso",
    cafeteria,
    700,
    "bar",
    "Café especial moído na hora",
    [{ stockItemId: coffee, quantityMilli: 18_000 }],
    true,
    "CAFÉ ESPECIAL",
  );
  addProduct(
    "Brownie com sorvete",
    desserts,
    2200,
    "cozinha",
    "Brownie de chocolate com uma porção de sorvete",
    [
      { stockItemId: brownie, quantityMilli: 1000 },
      { stockItemId: iceCream, quantityMilli: 1000 },
    ],
  );
  addProduct(
    "Especial de temporada",
    specials,
    5800,
    "cozinha",
    "Exemplo de produto temporariamente pausado",
    [{ stockItemId: leaves, quantityMilli: 100_000 }],
    false,
    "EM BREVE",
  );
  for (const name of ["Hortifruti da Vila", "Bebidas e Cafés Central"]) {
    if (!state.suppliers.some((entry) => entry.name === name))
      run("supplier.save", { name, phone: "", active: true });
  }
  const product = (name: string) => {
    const value = state.products.find((entry) => entry.name === name && entry.active);
    if (!value)
      throw new Error(
        `Produto necessário não encontrado: ${name}. Execute primeiro npm run db:seed.`,
      );
    return value;
  };
  const add = (tabId: string, name: string, quantity = 1, notes = "", optionName?: string) => {
    const entry = product(name);
    const option = optionName
      ? entry.options.find((value) => value.name === optionName)
      : undefined;
    if (optionName && !option) throw new Error(`Opção necessária não encontrada: ${optionName}.`);
    return entity(
      "item.add",
      { tabId, productId: entry.id, quantity, notes, optionIds: option ? [option.id] : [] },
      "garcom",
    );
  };
  const itemsFor = (tabId: string) =>
    state.items.filter((item) => item.tabId === tabId && item.status !== "cancelado");
  const progress = (itemId: string, target: "preparo" | "pronto" | "entregue", amount?: number) => {
    const item = state.items.find((entry) => entry.id === itemId)!;
    const role = item.station === "direto" ? "garcom" : item.station;
    const quantity = amount ?? item.quantity;
    if ((item.startedQuantity ?? 0) < quantity)
      run("item.start", { itemId, quantity: quantity - (item.startedQuantity ?? 0) }, role);
    // A separação de produtos prontos já os deixa prontos para entrega.
    if (target !== "preparo" && (item.readyQuantity ?? 0) < quantity)
      run("item.ready", { itemId, quantity: quantity - (item.readyQuantity ?? 0) }, role);
    if (target === "entregue" && (item.deliveredQuantity ?? 0) < quantity)
      run("item.deliver", { itemId, quantity: quantity - (item.deliveredQuantity ?? 0) }, "garcom");
  };
  const open = (label: string, channel: Channel, people = 2, tableIds: string[] = []) => {
    const visitId = entity(
      "visit.open",
      {
        label,
        channel,
        people,
        tableIds,
        customerName: label,
        phone: "(11) 99999-0000",
        address: channel === "delivery" ? "Rua Exemplo, 120 — endereço fictício" : "",
      },
      "garcom",
    );
    const tabId = state.tabs.find((tab) => tab.visitId === visitId)!.id;
    return { visitId, tabId };
  };
  const send = (tabIds: string[]) => run("order.send", { tabIds }, "garcom");
  const receive = (
    tabId: string,
    method: string,
    amountCents = tabTotals(state, tabId).balanceCents,
    tenderedCents?: number,
  ) =>
    entity(
      "payment.record",
      {
        tabIds: [tabId],
        amountCents,
        method,
        ...(tenderedCents ? { tenderedCents } : {}),
        reference: "Demonstração acadêmica — recebido externamente",
      },
      "caixa",
    );
  const close = (visitId: string, tabId: string) => {
    run("tab.close", { tabId }, "caixa");
    run("visit.close", { visitId }, "caixa");
  };
  // As vendas históricas passam por envio, reserva, preparo, entrega e recebimento.
  for (let day = 6; day >= 1; day--) {
    const base = ago(day * 1440 + 120);
    at(base - 5 * minute);
    const cashId = entity(
      "cash.open",
      {
        openingCents: 20000,
        label: `Turno demonstrativo — ${new Date(base).toLocaleDateString("pt-BR", { timeZone: state.restaurant.timezone })}`,
      },
      "caixa",
    );
    for (let order = 0; order < 3; order++) {
      const start = base + order * 25 * minute;
      at(start);
      const channel: Channel =
        order === 0 ? "salao" : order === 1 ? "balcao" : day % 2 ? "delivery" : "retirada";
      // Histórico de salão usa mesa livre sem bloquear o turno atual.
      let tableIds: string[] = [];
      if (channel === "salao") {
        const table = state.tables.find(
          (entry) =>
            entry.active &&
            !state.occupancies.some((value) => value.tableId === entry.id && !value.releasedAt) &&
            !state.reservations.some(
              (r) =>
                r.status === "confirmada" &&
                r.tableIds.includes(entry.id) &&
                r.startsAt <= new Date(start).toISOString() &&
                r.endsAt > new Date(start).toISOString(),
            ),
        );
        if (!table)
          throw new Error(
            "Não há mesa livre para montar o histórico sem alterar atendimentos existentes.",
          );
        tableIds = [table.id];
      }
      const visit = open(`Venda demonstrativa D-${day} / ${order + 1}`, channel, 2, tableIds);
      add(
        visit.tabId,
        order === 1 ? "Risoto de cogumelos" : "Burger da casa",
        1 + ((day + order) % 3),
      );
      add(
        visit.tabId,
        order === 0 ? "Água mineral" : order === 1 ? "Refrigerante lata" : "Suco de laranja",
        2,
      );
      add(visit.tabId, order === 0 ? "Batata rústica da casa" : "Brownie com sorvete");
      at(start + 2 * minute);
      send([visit.tabId]);
      at(start + 6 * minute);
      itemsFor(visit.tabId).forEach((item) => progress(item.id, "preparo"));
      at(start + 14 * minute);
      itemsFor(visit.tabId).forEach((item) => progress(item.id, "pronto"));
      at(start + 16 * minute);
      itemsFor(visit.tabId).forEach((item) => progress(item.id, "entregue"));
      if (channel === "delivery")
        run("visit.update", { visitId: visit.visitId, deliveryStatus: "entregue" }, "garcom");
      at(start + 18 * minute);
      if (day % 2 === 0)
        run("tab.adjust", {
          tabId: visit.tabId,
          discountCents: 500,
          reason: "Cortesia demonstrativa de fidelidade",
        });
      const method = ["pix", "credito", "dinheiro", "debito"][(day + order) % 4];
      const balance = tabTotals(state, visit.tabId).balanceCents;
      receive(
        visit.tabId,
        method,
        balance,
        method === "dinheiro" ? Math.ceil(balance / 1000) * 1000 : undefined,
      );
      at(start + 20 * minute);
      close(visit.visitId, visit.tabId);
    }
    at(base + 80 * minute);
    run(
      "cash.close",
      {
        cashSessionId: cashId,
        countedCents: cashExpected(state, cashId),
        reason: "Conferência do turno demonstrativo",
      },
      "caixa",
    );
  }
  at(ago(160));
  const currentCash = entity(
    "cash.open",
    { openingCents: 30000, label: "Turno atual · demonstração TAVO" },
    "caixa",
  );
  run(
    "cash.move",
    {
      kind: "suprimento",
      amountCents: 10000,
      reason: "Troco adicional para o turno demonstrativo",
    },
    "caixa",
  );
  run(
    "cash.move",
    { kind: "sangria", amountCents: 8000, reason: "Retirada demonstrativa para o cofre" },
    "caixa",
  );
  const freeTables = state.tables.filter(
    (entry) =>
      entry.active &&
      !state.occupancies.some((value) => value.tableId === entry.id && !value.releasedAt) &&
      !state.reservations.some(
        (reservation) =>
          reservation.status === "confirmada" &&
          reservation.tableIds.includes(entry.id) &&
          reservation.startsAt <= now.toISOString() &&
          reservation.endsAt > now.toISOString(),
      ),
  );
  while (freeTables.length < 8) {
    const number = Math.max(0, ...state.tables.map((entry) => entry.number)) + 1;
    const tableId = entity("table.save", {
      number,
      capacity: 6,
      sector: "Demonstração",
      active: true,
    });
    freeTables.push(state.tables.find((entry) => entry.id === tableId)!);
  }
  const tables = freeTables.slice(0, 8);
  // Duas vendas concluídas hoje deixam descontos, perda e estorno visíveis.
  at(ago(145));
  const lunch = open("Almoço concluído · demonstração", "salao", 2, [tables[5].id]);
  add(lunch.tabId, "Burger da casa", 2);
  add(lunch.tabId, "Água mineral", 2);
  add(lunch.tabId, "Batata rústica da casa");
  const cancelledBefore = add(
    lunch.tabId,
    "Suco de laranja",
    1,
    "Exemplo de cancelamento antes do preparo",
  );
  const cancelledAfter = add(
    lunch.tabId,
    "Petit gâteau",
    1,
    "Exemplo de perda após início do preparo",
  );
  at(ago(143));
  send([lunch.tabId]);
  run("item.cancel", {
    itemId: cancelledBefore,
    reason: "Cliente desistiu antes do preparo — reserva liberada",
  });
  at(ago(139));
  progress(cancelledAfter, "preparo");
  run("item.cancel", {
    itemId: cancelledAfter,
    reason: "Sobremesa danificada após o preparo — perda demonstrativa",
  });
  itemsFor(lunch.tabId).forEach((item) => progress(item.id, "preparo"));
  at(ago(131));
  itemsFor(lunch.tabId).forEach((item) => progress(item.id, "pronto"));
  at(ago(129));
  itemsFor(lunch.tabId).forEach((item) => progress(item.id, "entregue"));
  const firstPayment = receive(lunch.tabId, "pix", 6000);
  receive(lunch.tabId, "debito");
  run("tab.adjust", {
    tabId: lunch.tabId,
    discountCents: 500,
    reason: "Cortesia após o recebimento — demonstração de estorno",
  });
  run("payment.refund", {
    paymentId: firstPayment,
    amountCents: 500,
    reason: "Devolução externa da cortesia demonstrativa",
  });
  close(lunch.visitId, lunch.tabId);
  at(ago(120));
  const delivered = open("Delivery concluído · demonstração", "delivery");
  add(delivered.tabId, "Risoto de cogumelos", 2);
  add(delivered.tabId, "Refrigerante lata", 2);
  at(ago(118));
  send([delivered.tabId]);
  at(ago(114));
  itemsFor(delivered.tabId).forEach((item) => progress(item.id, "preparo"));
  at(ago(106));
  itemsFor(delivered.tabId).forEach((item) => progress(item.id, "pronto"));
  at(ago(104));
  itemsFor(delivered.tabId).forEach((item) => progress(item.id, "entregue"));
  run("visit.update", { visitId: delivered.visitId, deliveryStatus: "entregue" }, "garcom");
  const deliveryBalance = tabTotals(state, delivered.tabId).balanceCents;
  receive(delivered.tabId, "dinheiro", deliveryBalance, Math.ceil(deliveryBalance / 1000) * 1000);
  close(delivered.visitId, delivered.tabId);
  at(ago(90));
  const couple = open("Ana", "salao", 2, [tables[0].id]);
  const bruno = entity("tab.create", { visitId: couple.visitId, label: "Bruno" }, "garcom");
  const anaBurger = add(
    couple.tabId,
    "Burger da casa",
    1,
    "Ponto da carne: bem passado",
    "Cheddar extra",
  );
  const anaWater = add(couple.tabId, "Água mineral");
  const brunoRisotto = add(bruno, "Risoto de cogumelos", 1, "Sem pimenta");
  add(bruno, "Spritz da casa", 1, "Pouco gelo");
  at(ago(88));
  send([couple.tabId, bruno]);
  at(ago(84));
  progress(anaBurger, "preparo");
  progress(anaWater, "entregue");
  progress(brunoRisotto, "preparo");
  at(ago(76));
  progress(anaBurger, "pronto");
  at(ago(74));
  progress(anaBurger, "entregue");
  receive(couple.tabId, "pix", 2500);
  at(ago(65));
  const family = open("Família Oliveira", "salao", 3, [tables[1].id]);
  const familyBurgers = add(
    family.tabId,
    "Burger da casa",
    3,
    "Uma entrega parcial para conferir o andamento",
    "Sem queijo",
  );
  const familyPotatoes = add(family.tabId, "Batata rústica da casa", 2);
  const familySoda = add(family.tabId, "Refrigerante lata", 3);
  at(ago(63));
  send([family.tabId]);
  at(ago(59));
  progress(familyBurgers, "preparo", 1);
  progress(familyPotatoes, "preparo", 1);
  progress(familySoda, "entregue");
  at(ago(51));
  progress(familyBurgers, "pronto", 1);
  at(ago(49));
  progress(familyBurgers, "entregue", 1);
  at(ago(40));
  const ready = open("Executivo · pronto para servir", "salao", 2, [tables[2].id]);
  add(ready.tabId, "Risoto de cogumelos", 2);
  add(ready.tabId, "Suco de laranja", 2);
  at(ago(38));
  send([ready.tabId]);
  at(ago(34));
  itemsFor(ready.tabId).forEach((item) => progress(item.id, "preparo"));
  at(ago(26));
  itemsFor(ready.tabId).forEach((item) => progress(item.id, "pronto"));
  at(ago(35));
  const carolina = open("Carolina", "salao", 4, [tables[3].id]);
  const diego = open("Diego", "salao", 3, [tables[4].id]);
  add(carolina.tabId, "Burger da casa", 2);
  add(carolina.tabId, "Água mineral", 2);
  add(diego.tabId, "Burger da casa");
  add(diego.tabId, "Spritz da casa", 2);
  at(ago(33));
  send([carolina.tabId, diego.tabId]);
  at(ago(29));
  [...itemsFor(carolina.tabId), ...itemsFor(diego.tabId)].forEach((item) =>
    progress(item.id, "preparo"),
  );
  at(ago(21));
  [...itemsFor(carolina.tabId), ...itemsFor(diego.tabId)].forEach((item) =>
    progress(item.id, "pronto"),
  );
  at(ago(19));
  itemsFor(carolina.tabId).forEach((item) => progress(item.id, "entregue"));
  receive(carolina.tabId, "dinheiro", 4000, 5000);
  receive(diego.tabId, "pix", 3000);
  const groupId = entity(
    "group.join",
    { tableIds: [tables[3].id, tables[4].id], mode: "unica", label: "Aniversário da Carolina" },
    "garcom",
  );
  at(ago(24));
  const counter = open("Pedro · balcão", "balcao", 1);
  const coffees = add(counter.tabId, "Café espresso", 2);
  const counterWater = add(counter.tabId, "Água mineral");
  at(ago(22));
  send([counter.tabId]);
  at(ago(18));
  progress(coffees, "preparo");
  progress(counterWater, "entregue");
  at(ago(14));
  progress(coffees, "pronto");
  receive(counter.tabId, "dinheiro");
  at(ago(20));
  const pickup = open("Luiza · retirada", "retirada");
  add(pickup.tabId, "Burger da casa", 2);
  add(pickup.tabId, "Batata rústica da casa");
  at(ago(18));
  send([pickup.tabId]);
  at(ago(30));
  const shipping = open("Rafael · delivery a caminho", "delivery");
  add(shipping.tabId, "Risoto de cogumelos", 2);
  add(shipping.tabId, "Refrigerante lata", 2);
  at(ago(28));
  send([shipping.tabId]);
  at(ago(24));
  itemsFor(shipping.tabId).forEach((item) => progress(item.id, "preparo"));
  at(ago(16));
  itemsFor(shipping.tabId).forEach((item) => progress(item.id, "pronto"));
  at(ago(14));
  itemsFor(shipping.tabId).forEach((item) => progress(item.id, "entregue"));
  receive(shipping.tabId, "credito");
  run("visit.update", { visitId: shipping.visitId, deliveryStatus: "despachado" }, "garcom");
  at(ago(10));
  const draft = open("Camila · orçamento ainda não enviado", "retirada");
  add(draft.tabId, "Salada da horta");
  add(draft.tabId, "Suco de laranja");
  // Reservas relativas à execução: uma já pode receber check-in e outra é futura.
  const upcomingReservation = entity(
    "reservation.save",
    {
      customerName: "Juliana Costa",
      phone: "(11) 99999-0000",
      people: 4,
      tableIds: [tables[6].id],
      startsAt: new Date(ago(5)).toISOString(),
      endsAt: new Date(now.getTime() + 85 * minute).toISOString(),
      notes: "Reserva de demonstração: faça o check-in nesta mesa",
    },
    "garcom",
  );
  entity(
    "reservation.save",
    {
      customerName: "Equipe Horizonte",
      phone: "",
      people: 4,
      tableIds: [tables[7].id],
      startsAt: new Date(now.getTime() + 120 * minute).toISOString(),
      endsAt: new Date(now.getTime() + 210 * minute).toISOString(),
      notes: "Mesa para reunião de equipe — dados fictícios",
    },
    "garcom",
  );
  const cancelledReservation = entity(
    "reservation.save",
    {
      customerName: "Reserva cancelada · exemplo",
      phone: "",
      people: 2,
      tableIds: [],
      startsAt: new Date(ago(180)).toISOString(),
      endsAt: new Date(ago(90)).toISOString(),
      notes: "Exemplo de histórico",
    },
    "garcom",
  );
  run("reservation.status", { reservationId: cancelledReservation, status: "cancelada" }, "garcom");
  for (const [index, name] of ["Gabriel e família", "Beatriz", "Roberto Lima"].entries()) {
    at(ago(20 - index * 5));
    const waitId = entity(
      "waitlist.add",
      { customerName: name, phone: "", people: index === 1 ? 2 : 4 },
      "garcom",
    );
    if (index === 1) run("waitlist.status", { waitId, status: "chamado" }, "garcom");
  }
  at(ago(4));
  run(
    "call.create",
    {
      visitId: family.visitId,
      destination: "cozinha",
      message: "Mesa com entrega parcial: conferir os dois burgers que ainda não começaram.",
    },
    "garcom",
  );
  run(
    "call.create",
    {
      visitId: couple.visitId,
      destination: "bar",
      message: "Spritz do Bruno com pouco gelo; pedido aguardando início no bar.",
    },
    "garcom",
  );
  run(
    "call.create",
    {
      visitId: ready.visitId,
      destination: "salao",
      message: "Risotos e sucos prontos para servir na mesa do executivo.",
    },
    "cozinha",
  );
  at(now.getTime());
  run("call.create", {
    destination: "salao",
    message:
      "Cenário acadêmico carregado. Mesas, clientes e recebimentos desta carga são demonstrativos.",
  });
  const summary = {
    generatedAt: now.toISOString(),
    restaurant: state.restaurant.name,
    added: Object.fromEntries(
      (
        [
          "products",
          "stockItems",
          "visits",
          "orders",
          "payments",
          "refunds",
          "reservations",
          "waitlist",
          "calls",
        ] as const
      ).map((key) => [key, state[key].length - before[key].length]),
    ),
    tables: tables.slice(0, 5).map((table, index) => ({
      number: table.number,
      scenario: [
        "Ana e Bruno · individuais e Pix parcial",
        "Família Oliveira · preparo e entrega parciais",
        "Executivo · pronto para servir",
        "Aniversário · conta única",
        "Aniversário · conta única",
      ][index],
    })),
    practiceTable: tables[5].number,
    reservationTable: tables[6].number,
    waitingTable: tables[7].number,
    currentCashId: currentCash,
    expectedCashCents: cashExpected(state, currentCash),
    groupId,
    upcomingReservation,
    visits: {
      couple: couple.visitId,
      family: family.visitId,
      ready: ready.visitId,
      counter: counter.visitId,
      pickup: pickup.visitId,
      shipping: shipping.visitId,
      draft: draft.visitId,
    },
  };
  return summary;
}
