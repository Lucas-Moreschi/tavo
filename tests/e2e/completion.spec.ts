import { test, expect, command, readState as snapshot, origin } from "./support";

test.use({ timezoneId: "Asia/Tokyo" });

test("conta de grupo: prévias, divisão, impressão, separação e encerramento", async ({
  page,
  context,
  accounts,
}) => {
  const request = page.request;
  await accounts.create(request, { deliveryFeeCents: 0 });
  await page.goto("/");
  await expect(page.getByText("0 de 5 etapas concluídas")).toBeVisible();
  const table1 = (
    await command(request, "table.save", { number: 1, capacity: 4, sector: "Salão", active: true })
  ).result.entityId;
  const table2 = (
    await command(request, "table.save", { number: 2, capacity: 4, sector: "Salão", active: true })
  ).result.entityId;
  await command(request, "table.save", { number: 3, capacity: 4, sector: "Salão", active: true });
  const categoryId = (await command(request, "category.save", { name: "Bebidas", active: true }))
    .result.entityId;
  const productId = (
    await command(request, "product.save", {
      categoryId,
      name: "Água QA",
      priceCents: 1000,
      description: "Teste",
      station: "direto",
      active: true,
      recipe: [],
      options: [],
    })
  ).result.entityId;
  const visit1 = (
    await command(request, "visit.open", { tableIds: [table1], people: 2, label: "Ana" })
  ).result.entityId;
  const visit2 = (
    await command(request, "visit.open", { tableIds: [table2], people: 2, label: "Bruno" })
  ).result.entityId;
  const initial = await snapshot(request);
  const tabs = [visit1, visit2].map((id) => initial.tabs.find((tab) => tab.visitId === id)!);
  for (const [index, tab] of tabs.entries()) {
    const itemId = (
      await command(request, "item.add", { tabId: tab.id, productId, quantity: index + 1 })
    ).result.entityId;
    await command(request, "order.send", { tabIds: [tab.id] });
    await command(request, "item.start", { itemId });
    await command(request, "item.deliver", { itemId });
  }
  await command(request, "cash.open", { openingCents: 0, label: "QA" });
  await command(request, "payment.record", {
    tabIds: [tabs[0].id],
    amountCents: 300,
    method: "pix",
  });
  await command(request, "payment.record", {
    tabIds: [tabs[1].id],
    amountCents: 700,
    method: "credito",
  });
  await page.goto("/?view=mesas");
  await page.getByRole("button", { name: "Juntar mesas", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Mesa 1", { exact: false }).check();
  await dialog.getByLabel("Mesa 2", { exact: false }).check();
  await dialog.getByLabel("Organização das contas").selectOption("unica");
  await dialog.getByLabel("Nome do grupo").fill("Grupo QA");
  await expect(dialog.locator(".account-totals")).toContainText("33,00");
  await expect(dialog.locator(".account-totals")).toContainText("10,00");
  await dialog.getByRole("button", { name: "Confirmar agrupamento" }).click();
  await expect(dialog).not.toBeVisible();
  const groupCard = page.getByRole("region", { name: "Grupo QA", exact: true });
  const firstTable = groupCard.getByRole("button", { name: /Mesa 01/ });
  const secondTable = groupCard.getByRole("button", { name: /Mesa 02/ });
  await expect(groupCard.getByText("Mesas 01 + 02", { exact: true })).toBeVisible();
  await expect(groupCard.getByText("Conta única", { exact: true })).toBeVisible();
  await expect(firstTable).toBeVisible();
  await expect(secondTable).toBeVisible();
  const search = page.getByPlaceholder("Buscar número da mesa");
  await search.fill("2");
  await expect(firstTable).toHaveCount(0);
  await expect(secondTable).toBeVisible();
  await expect(groupCard.getByText("Mesas 01 + 02", { exact: true })).toBeVisible();
  await search.clear();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect
      .poll(() => groupCard.evaluate((card) => card.getBoundingClientRect().right <= innerWidth))
      .toBe(true);
  }
  const freeTable = page.getByRole("button", { name: /Mesa 03/ });
  await expect(freeTable).toBeVisible();
  const groupHeight = await groupCard.evaluate((card) => card.getBoundingClientRect().height);
  await expect
    .poll(() => freeTable.evaluate((card) => card.getBoundingClientRect().height))
    .toBeCloseTo(groupHeight, 0);
  await firstTable.click();
  await expect(page).toHaveURL(`/?view=mesas&visit=${visit1}`);
  await expect(page.getByRole("button", { name: "Conta do grupo", exact: true })).toHaveClass(
    /active/,
  );
  await expect(page.locator(".summary-total")).toContainText("33,00");
  await expect(page.locator(".summary-balance")).toContainText("23,00");
  await expect(page.locator(".comanda-items")).toContainText("Mesa 1");
  await expect(page.locator(".comanda-items")).toContainText("Mesa 2");
  await expect(page.locator(".page-heading")).toContainText("4 pessoas");
  await page.getByRole("button", { name: "Conta da mesa (Mesa 2)", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Mesa 2");
  await expect(page.locator(".summary-total")).toContainText("22,00");
  await page.getByRole("button", { name: "Encerrar atendimento", exact: true }).click();
  const refusedClose = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/commands") &&
      response.request().postDataJSON()?.action === "visit.close",
  );
  await page.getByRole("dialog").getByRole("button", { name: "Encerrar e liberar mesa" }).click();
  const closeResponse = await refusedClose;
  expect(closeResponse.status()).toBe(409);
  expect(closeResponse.request().postDataJSON().payload.visitId).toBe(visit2);
  await page.getByRole("dialog").getByRole("button", { name: "Cancelar", exact: true }).click();
  await page.getByRole("button", { name: "Conta do grupo", exact: true }).click();
  await page.locator(".split-calculator input").fill("2.5");
  await expect(page.locator(".split-calculator input")).toHaveValue("2");
  await page.locator(".split-calculator input").fill("3");
  await expect(page.locator(".split-calculator small")).toContainText("7,67");
  await page.getByRole("button", { name: "Receber conta do grupo" }).click();
  dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Valor aplicado à conta (R$)")).toHaveValue("7.67");
  await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
  await page.screenshot({ path: "test-results/tavo-grupo-desktop.png", fullPage: true });
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".receipt-footer")).toContainText("DOCUMENTO NÃO FISCAL");
  await expect(page.locator(".receipt-footer")).toContainText("3,00");
  await expect(page.locator(".receipt-footer")).toContainText("7,00");
  await expect(page.locator(".menu-panel")).not.toBeVisible();
  await page.pdf({
    path: "test-results/tavo-conta-grupo.pdf",
    format: "A4",
    printBackground: true,
  });
  await page.emulateMedia({ media: "screen" });
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
    if (width === 390)
      await page.screenshot({ path: "test-results/tavo-grupo-celular.png", fullPage: true });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "Separar", exact: true }).click();
  await expect(page.getByRole("dialog").locator(".account-origin-row")).toHaveCount(2);
  await page.getByRole("button", { name: "Confirmar separação" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  let current = await snapshot(request);
  expect(current.payments).toHaveLength(2);
  expect(current.visits.every((visit) => !visit.groupId)).toBe(true);
  await page.goto("/?view=mesas");
  await expect(groupCard).toHaveCount(0);
  const groupId = (
    await command(request, "group.join", {
      tableIds: [table1, table2],
      mode: "unica",
      label: "Grupo final",
    })
  ).result.entityId;
  await command(request, "payment.record", {
    tabIds: tabs.map((tab) => tab.id),
    amountCents: 2300,
    method: "debito",
  });
  await page.goto(`/?view=mesas&visit=${visit1}`);
  await page.getByRole("button", { name: "Encerrar grupo e liberar mesas" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Encerrar grupo", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  current = await snapshot(request);
  expect(current.groups.find((group) => group.id === groupId)?.closedAt).toBeTruthy();
  expect(current.occupancies.every((entry) => entry.releasedAt)).toBe(true);
  await page.goto(`/?view=comandas&visit=${visit1}`);
  await expect(page.locator(".summary-total")).toContainText("33,00");
  await expect(page.locator(".summary-balance")).toContainText("0,00");

  await page.goto("/?view=relatorios");
  await page.getByLabel("Data inicial").fill("2020-01-01");
  await page.getByLabel("Exportar").selectOption("vendas");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar CSV" }).click();
  expect((await download).suggestedFilename()).toMatch(/^tavo-vendas-2020-01-01/);
  await page.getByLabel("Data inicial").fill("2099-01-01");
  await expect(page.locator(".form-error[role=alert]")).toContainText("data inicial");
  await expect(page.getByRole("button", { name: "Exportar CSV" })).toBeDisabled();
});

test("cancelamento, reserva no fuso do restaurante e convite com URL completa", async ({
  page,
  context,
  accounts,
  playwright,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const request = page.request;
  await accounts.create(request, { serviceRateBps: 0, deliveryFeeCents: 0 });
  const outsider = await playwright.request.newContext({ baseURL: origin });
  const invited = await accounts.create(outsider);
  await outsider.dispose();
  const categoryId = (await command(request, "category.save", { name: "Pratos", active: true }))
    .result.entityId;
  const productId = (
    await command(request, "product.save", {
      categoryId,
      name: "Prato cancelado",
      priceCents: 1000,
      description: "Teste",
      station: "cozinha",
      active: true,
      recipe: [],
      options: [],
    })
  ).result.entityId;
  const visitId = (await command(request, "visit.open", { channel: "balcao", people: 1 })).result
    .entityId;
  const tabId = (await snapshot(request)).tabs.find((tab) => tab.visitId === visitId)!.id;
  const itemId = (await command(request, "item.add", { tabId, productId, quantity: 2 })).result
    .entityId;
  await command(request, "order.send", { tabIds: [tabId] });
  await command(request, "item.cancel", {
    itemId,
    quantity: 1,
    reason: "Cliente alterou o pedido",
  });
  await page.goto("/?view=producao");
  await expect(page.getByRole("region", { name: "Cancelamentos pendentes" })).toContainText(
    "1x Prato cancelado",
  );
  await page.reload();
  await page.getByRole("button", { name: "Ciente" }).click();
  await expect(page.getByRole("region", { name: "Cancelamentos pendentes" })).not.toBeVisible();
  await page.getByText("Últimos cancelamentos (1)", { exact: true }).click();
  await expect(page.locator(".cancellation-history")).toContainText("Cliente alterou o pedido");
  await expect(page.locator(".kitchen-card")).toContainText("1×");

  // O computador do atendente está em Tóquio; a reserva pertence ao fuso de Manaus.
  await command(request, "settings.update", {
    name: "QA cancelamento",
    phone: "11999999999",
    address: "Rua QA",
    timezone: "America/Manaus",
    serviceRateBps: 0,
    reservationMinutes: 90,
    deliveryFeeCents: 0,
  });
  await page.goto("/?view=reservas");
  await page.getByRole("button", { name: "Nova reserva" }).click();
  let dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("America/Manaus");
  await dialog.getByLabel("Nome do cliente").fill("Reserva fuso QA");
  await dialog.getByLabel("Telefone").fill("11999999999");
  await dialog.getByLabel("Início").fill("2027-01-15T18:00");
  await dialog.getByLabel("Fim").fill("2027-01-15T19:30");
  await dialog.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect((await snapshot(request)).reservations[0].startsAt).toBe("2027-01-15T22:00:00.000Z");
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  await expect(page.getByRole("dialog").getByLabel("Início")).toHaveValue("2027-01-15T18:00");
  await page.getByRole("dialog").getByRole("button", { name: "Cancelar", exact: true }).click();

  await page.goto("/?view=equipe");
  await page.getByRole("button", { name: "Nova pessoa" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nome completo").fill("Gestor Bistrô");
  await dialog.getByLabel("E-mail").fill(invited.email);
  await dialog.getByLabel("Senha provisória").fill("SenhaInutilizada123!");
  await dialog.getByRole("button", { name: "Adicionar à equipe", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  const invite = page.locator(".notice-banner a");
  await expect(invite).toHaveAttribute(
    "href",
    new RegExp(`^${origin.replaceAll(".", "\\.")}/convite\\?token=`),
  );
  await page.getByRole("button", { name: "Copiar link" }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    await invite.getAttribute("href"),
  );
});
