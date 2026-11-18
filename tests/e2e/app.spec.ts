import {
  test,
  expect,
  command,
  readState as state,
  origin,
  serviceFixtures,
  loginStaff,
} from "./support";
import { randomUUID } from "node:crypto";

test("cadastro e fluxo real: estoque, preparo parcial, grupo, recebimentos e fechamento", async ({
  request,
  accounts,
}) => {
  await accounts.create(request);
  const initial = await state(request);
  expect(initial.tables).toHaveLength(0);
  const table1 = (
    await command(request, "table.save", { number: 1, capacity: 4, sector: "Salão", active: true })
  ).result.entityId;
  const table2 = (
    await command(request, "table.save", { number: 2, capacity: 4, sector: "Salão", active: true })
  ).result.entityId;
  const categoryId = (await command(request, "category.save", { name: "Pratos", active: true }))
    .result.entityId;
  const stockId = (
    await command(request, "stock.save", {
      name: "Ingrediente QA",
      unit: "g",
      minimumMilli: 1000,
      active: true,
    })
  ).result.entityId;
  await command(request, "stock.entry", {
    stockItemId: stockId,
    quantityMilli: 1000000,
    costCents: 5000,
    reason: "Entrada de validação",
  });
  const productId = (
    await command(request, "product.save", {
      categoryId,
      name: "Prato QA",
      priceCents: 3800,
      description: "Receita real",
      station: "cozinha",
      active: true,
      recipe: [{ stockItemId: stockId, quantityMilli: 100000 }],
      options: [],
    })
  ).result.entityId;
  const visit1 = (
    await command(request, "visit.open", { tableIds: [table1], channel: "salao", people: 2 })
  ).result.entityId;
  const visit2 = (
    await command(request, "visit.open", { tableIds: [table2], channel: "salao", people: 2 })
  ).result.entityId;
  let snapshot = await state(request);
  const tab1 = snapshot.tabs.find((tab) => tab.visitId === visit1)!;
  const itemId = (
    await command(request, "item.add", { tabId: tab1.id, productId, quantity: 3, notes: "Sem sal" })
  ).result.entityId;
  const sent = await command(request, "order.send", { tabIds: [tab1.id] });
  expect(sent.snapshot.stockItems[0].quantityMilli).toBe(1000000);
  expect(sent.snapshot.stockItems[0].reservedMilli).toBe(300000);
  await command(request, "item.start", { itemId, quantity: 1 });
  await command(request, "item.ready", { itemId, quantity: 1 });
  await command(request, "item.deliver", { itemId, quantity: 1 });
  const cancelled = await command(request, "item.cancel", {
    itemId,
    quantity: 2,
    reason: "Cliente ajustou o pedido antes do preparo",
  });
  expect(cancelled.snapshot.stockItems[0].quantityMilli).toBe(900000);
  expect(cancelled.snapshot.stockItems[0].reservedMilli).toBe(0);
  expect(cancelled.snapshot.items.find((item) => item.id === itemId)?.status).toBe("entregue");
  await command(request, "cash.open", { openingCents: 10000, label: "Validação" });
  const paymentKey = randomUUID();
  const partial = await command(
    request,
    "payment.record",
    { tabIds: [tab1.id], amountCents: 2000, method: "pix" },
    paymentKey,
  );
  expect(partial.snapshot.payments).toHaveLength(1);
  const replay = await command(
    request,
    "payment.record",
    { tabIds: [tab1.id], amountCents: 2000, method: "pix" },
    paymentKey,
  );
  expect(replay.replayed).toBe(true);
  expect(replay.snapshot.payments).toHaveLength(1);
  const groupId = (
    await command(request, "group.join", { tableIds: [table1, table2], mode: "unica" })
  ).result.entityId;
  const separated = await command(request, "group.split", { groupId });
  expect(separated.snapshot.payments).toHaveLength(1);
  await command(request, "payment.record", {
    tabIds: [tab1.id],
    amountCents: 2180,
    method: "credito",
  });
  await command(request, "tab.close", { tabId: tab1.id });
  await command(request, "visit.close", { visitId: visit1 });
  await command(request, "visit.close", { visitId: visit2, reason: "Mesa sem consumo" });
  snapshot = await state(request);
  expect(snapshot.occupancies.every((occupancy) => !!occupancy.releasedAt)).toBe(true);
  expect(snapshot.payments.reduce((sum, payment) => sum + payment.amountCents, 0)).toBe(4180);
  expect(snapshot.stockItems[0].quantityMilli).toBe(900000);
  const noOrigin = await request.post("/api/commands", {
    data: {
      action: "cash.open",
      payload: {},
      operationId: randomUUID(),
      expectedVersion: snapshot.version,
    },
  });
  expect(noOrigin.status()).toBe(403);
});

test("interface responsiva, sessão persistente, permissões e bloqueio offline", async ({
  page,
  context,
  accounts,
}) => {
  const credentials = await accounts.create(page.request);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/login");
  await page.getByLabel("E-mail", { exact: true }).fill(credentials.email);
  await page.getByLabel("Senha", { exact: true }).fill(credentials.password);
  await page.getByRole("button", { name: "Entrar no TAVO" }).click();
  await expect(page.locator(".application")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Mesas e salão", exact: true }).first(),
  ).toBeVisible();
  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 950 });
    await page.waitForTimeout(250);
    const overflow = await page.evaluate(() => ({
      document: document.documentElement.scrollWidth,
      viewport: window.innerWidth,
    }));
    expect(overflow.document, `Overflow em ${width}px`).toBeLessThanOrEqual(overflow.viewport + 1);
    await page.screenshot({ path: `test-results/tavo-${width}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  const contentWidth = await page
    .locator(".main-content")
    .evaluate((element) => element.getBoundingClientRect().width);
  expect(contentWidth).toBeGreaterThan(900);
  await page.reload();
  await expect(page.locator(".application")).toBeVisible();
  await context.setOffline(true);
  await expect(page.getByRole("alert").filter({ hasText: "Sem conexão" }).first()).toBeVisible();
  await context.setOffline(false);
  await page.getByRole("button", { name: "Mesas e salão", exact: true }).first().click();
  await expect(page.locator(".main-content")).toContainText("Mesas");
  await page.screenshot({ path: "test-results/tavo-salao-desktop.png", fullPage: true });
  expect(errors).toEqual([]);
});

test("formulários reais abrem mesa, adicionam opções, enviam e recuperam resposta perdida", async ({
  page,
  accounts,
}) => {
  const credentials = await accounts.create(page.request);
  const fixture = await serviceFixtures(page.request);
  await page.goto("/login");
  await page.getByLabel("E-mail", { exact: true }).fill(credentials.email);
  await page.getByLabel("Senha", { exact: true }).fill(credentials.password);
  await page.getByRole("button", { name: "Entrar no TAVO" }).click();
  await expect(page.locator(".application")).toBeVisible();
  const before = await state(page.request);
  const free = before.tables.find(
    (table) =>
      table.active &&
      !before.occupancies.some(
        (occupancy) => occupancy.tableId === table.id && !occupancy.releasedAt,
      ),
  );
  expect(free).toBeTruthy();
  await page.getByRole("button", { name: "Mesas e salão", exact: true }).first().click();
  await page
    .locator(".tables-grid .table-card")
    .filter({ hasText: `Mesa ${String(free!.number).padStart(2, "0")}` })
    .click();
  await page.getByRole("dialog").getByRole("button", { name: "Abrir atendimento" }).click();
  await expect(page.locator(".visit-layout")).toBeVisible();
  const visit = (await state(page.request)).visits.find(
    (entry) => !before.visits.some((old) => old.id === entry.id),
  )!;
  await page.getByRole("button", { name: "Adicionar Prato de teste", exact: true }).click();
  await page.getByRole("dialog").getByLabel("Opções e adicionais").selectOption(fixture.optionId);
  await page.getByRole("dialog").getByRole("button", { name: "Adicionar à comanda" }).click();
  await expect(page.locator(".comanda-item").filter({ hasText: "Prato de teste" })).toBeVisible();
  let intercepted = false;
  await page.route("**/api/commands", async (route) => {
    const body = route.request().postDataJSON();
    if (body.action === "order.send" && !intercepted) {
      intercepted = true;
      await route.fetch();
      await route.abort("failed");
    } else await route.continue();
  });
  await page.getByRole("button", { name: "Enviar para produção" }).click();
  await expect
    .poll(
      async () =>
        (await state(page.request)).orders.filter((order) => order.visitId === visit.id).length,
    )
    .toBe(1);
  await page.unroute("**/api/commands");
  await page.reload();
  await expect(page.locator(".visit-layout")).toBeVisible();
  await expect
    .poll(async () =>
      page.evaluate(
        () => Object.keys(sessionStorage).filter((key) => key.startsWith("tavo:pending:")).length,
      ),
    )
    .toBe(0);
  expect(
    (await state(page.request)).orders.filter((order) => order.visitId === visit.id),
  ).toHaveLength(1);
  const current = await state(page.request);
  const tab = current.tabs.find((entry) => entry.visitId === visit.id)!;
  const item = current.items.find(
    (entry) => entry.tabId === tab.id && entry.status !== "cancelado",
  )!;
  await command(page.request, "item.cancel", {
    itemId: item.id,
    reason: "Encerramento da validação de interface",
  });
  await command(page.request, "visit.close", {
    visitId: visit.id,
    reason: "Teste concluído sem consumo",
  });
  const after = await state(page.request);
  const testItems = new Set(
    after.items
      .filter((entry) => entry.cancelReason === "Encerramento da validação de interface")
      .map((entry) => entry.id),
  );
  for (const call of after.calls.filter(
    (entry) =>
      entry.kind === "cancelamento" &&
      entry.itemId &&
      testItems.has(entry.itemId) &&
      entry.status !== "concluido",
  ))
    await command(page.request, "call.status", { callId: call.id, status: "concluido" });
});

test("todas as áreas carregam, papéis são respeitados e arquivos ficam privados", async ({
  page,
  playwright,
  accounts,
}) => {
  const credentials = await accounts.create(page.request);
  const fixture = await serviceFixtures(page.request);
  const productionVisit = (
    await command(page.request, "visit.open", { channel: "balcao", people: 1 })
  ).result.entityId;
  const productionTab = (await state(page.request)).tabs.find(
    (entry) => entry.visitId === productionVisit,
  )!;
  await command(page.request, "item.add", {
    tabId: productionTab.id,
    productId: fixture.productId,
    quantity: 1,
  });
  await command(page.request, "order.send", { tabIds: [productionTab.id] });
  const kitchenCredentials = await accounts.addStaff(page.request, "cozinha");
  await page.goto("/login");
  await page.getByLabel("E-mail", { exact: true }).fill(credentials.email);
  await page.getByLabel("Senha", { exact: true }).fill(credentials.password);
  await page.getByRole("button", { name: "Entrar no TAVO" }).click();
  await expect(page.locator(".application")).toBeVisible();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const view of [
    "cardapio",
    "estoque",
    "reservas",
    "canais",
    "equipe",
    "relatorios",
    "configuracoes",
    "perfil",
    "producao",
    "caixa",
    "chamados",
  ]) {
    await page.goto(`/?view=${view}`);
    await expect(page.locator(".application")).toBeVisible();
    await expect(page.locator(".main-content h1")).toBeVisible();
  }
  const upload = await page.request.post("/api/files", {
    headers: { Origin: origin },
    multipart: {
      file: {
        name: "foto.png",
        mimeType: "image/png",
        buffer: await (await import("node:fs/promises")).readFile("public/icons/icon-192.png"),
      },
    },
  });
  expect(upload.status(), await upload.text()).toBe(200);
  const fileUrl = (await upload.json()).url;
  expect((await page.request.get(fileUrl)).status()).toBe(200);
  const other = await playwright.request.newContext({
    baseURL: origin,
    extraHTTPHeaders: { "x-forwarded-for": `192.0.2.${Math.floor(Math.random() * 200) + 1}` },
  });
  await accounts.create(other);
  expect((await other.get(fileUrl)).status()).toBe(404);
  await other.dispose();
  await page.goto("/restaurantes");
  await expect(page.getByRole("heading", { name: "Onde vamos trabalhar?" })).toBeVisible();
  await page.goto("/recuperar");
  await expect(page.getByRole("heading", { name: "Recuperar acesso" })).toBeVisible();
  const production = await playwright.request.newContext({
    baseURL: origin,
    extraHTTPHeaders: { "x-forwarded-for": `192.0.2.${Math.floor(Math.random() * 200) + 1}` },
  });
  await loginStaff(production, kitchenCredentials);
  const privateImage = await production.get(fileUrl);
  expect(privateImage.status()).toBe(200);
  expect(privateImage.headers()["content-type"]).toBe("image/png");
  expect(privateImage.headers()["cache-control"]).toBe("private, no-store");
  const restricted = await state(production);
  expect(restricted.stockItems).toHaveLength(0);
  expect(restricted.payments).toHaveLength(0);
  expect(restricted.items).toHaveLength(1);
  expect(restricted.items.every((item) => item.station === "cozinha")).toBe(true);
  const denied = await production.post("/api/commands", {
    headers: { Origin: origin },
    data: {
      action: "cash.open",
      payload: { openingCents: 0 },
      operationId: randomUUID(),
      expectedVersion: restricted.version,
    },
  });
  expect(denied.status()).toBe(403);
  await production.dispose();
  expect(errors).toEqual([]);
});

test("PWA de produção registra service worker, manifesto e fallback offline", async ({
  page,
  context,
}) => {
  test.skip(!process.env.TEST_PWA, "Requer servidor executando o build de produção");
  await page.goto("/login");
  await expect
    .poll(() =>
      page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())?.active),
    )
    .toBe(true);
  const manifest = await page.request.get("/manifest.webmanifest");
  expect(manifest.status()).toBe(200);
  expect((await manifest.json()).display).toBe("standalone");
  await page.reload();
  await context.setOffline(true);
  await page.goto("/rota-offline-de-teste");
  await expect(page.getByRole("heading", { name: "Vamos reconectar?" })).toBeVisible();
  await context.setOffline(false);
});
