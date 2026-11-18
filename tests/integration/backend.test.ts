import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { getPool, transaction, closePool } from "../../src/server/db";
import { getAuth } from "../../src/server/auth";
import {
  insertIdentity,
  saveTeamMember,
  acceptInvitation,
  updateProfile,
} from "../../src/server/access";
import {
  collections,
  emptyState,
  getSnapshot,
  getOperationResult,
  runCommand,
  saveState,
} from "../../src/server/repository";
import { onboardRestaurant } from "../../src/server/onboard";
import { applyCommand } from "../../src/domain/commands";
import type { Restaurant } from "../../src/domain/types";
import { accountRateLimit } from "../../src/server/http";
import { tabTotals } from "../../src/domain/finance";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { saveFile, loadFile } from "../../src/server/files";
import { MAX_IMAGE_BYTES } from "../../src/server/image-validation";

try {
  process.loadEnvFile();
} catch {
  /* CI injects its own environment. */
}
test(
  "PostgreSQL real: autenticação, isolamento, transações e convites",
  { skip: !process.env.DATABASE_URL },
  async (suite) => {
    const suffix = randomUUID();
    const tenants = [randomUUID(), randomUUID()];
    const users: string[] = [];
    const password = "TavoIntegration123!";
    const emails = [`a-${suffix}@integration.test`, `b-${suffix}@integration.test`];
    const origin = new URL(process.env.BETTER_AUTH_URL || "http://localhost:3000").origin;
    const headers: Headers[] = [];
    try {
      const passwordHash = await hashPassword(password);
      await transaction(async (client) => {
        for (let i = 0; i < 2; i++) {
          const userId = await insertIdentity(client, {
            name: `Gestor integração ${i}`,
            email: emails[i],
            passwordHash,
          });
          users.push(userId);
          const restaurant: Restaurant = {
            id: tenants[i],
            name: `Integração ${i}`,
            slug: `integration-${i}-${suffix}`,
            plan: "teste",
            timezone: "America/Sao_Paulo",
            serviceRateBps: 1000,
            reservationMinutes: 90,
            deliveryFeeCents: 0,
            address: "",
            phone: "",
            createdAt: new Date().toISOString(),
          };
          await client.query("INSERT INTO restaurants(id,slug,body) VALUES($1,$2,$3::jsonb)", [
            restaurant.id,
            restaurant.slug,
            JSON.stringify(restaurant),
          ]);
          await client.query(
            "INSERT INTO memberships(id,restaurant_id,user_id,role) VALUES($1,$2,$3,'gestor')",
            [randomUUID(), restaurant.id, userId],
          );
          await saveState(client, emptyState(restaurant));
        }
      });
      for (let i = 0; i < 2; i++) {
        const response = await getAuth().api.signInEmail({
          body: { email: emails[i], password },
          headers: new Headers({ origin }),
          asResponse: true,
        });
        assert.equal(
          response.status,
          200,
          "BetterAuth precisa autenticar a credencial criada atomicamente",
        );
        headers.push(
          new Headers({
            origin,
            cookie: response.headers
              .getSetCookie()
              .map((cookie) => cookie.split(";")[0])
              .join("; "),
            "x-restaurant-id": tenants[i],
          }),
        );
      }
      await suite.test("identidade não acessa restaurante sem vínculo", async () => {
        const foreign = new Headers(headers[0]);
        foreign.set("x-restaurant-id", tenants[1]);
        await assert.rejects(
          getSnapshot(foreign),
          (error) => (error as { status: number }).status === 403,
        );
        assert.equal((await getSnapshot(headers[0])).restaurant.id, tenants[0]);
      });
      await suite.test("operação repetida concorrente produz um único efeito", async () => {
        const command = {
          action: "table.save",
          payload: { number: 1, capacity: 4, sector: "Salão", active: true },
          operationId: randomUUID(),
        };
        const results = await Promise.all([
          runCommand(headers[0], command, applyCommand),
          runCommand(headers[0], command, applyCommand),
        ]);
        assert.equal(results.filter((result) => result.replayed).length, 1);
        const state = await getSnapshot(headers[0]);
        assert.equal(state.tables.length, 1);
        assert.equal(state.version, 1);
        assert.equal((await getOperationResult(headers[0], command.operationId)).found, true);
        assert.equal((await getOperationResult(headers[1], command.operationId)).found, false);
        await assert.rejects(
          runCommand(
            headers[0],
            { ...command, payload: { ...command.payload, capacity: 6 } },
            applyCommand,
          ),
          (error) => (error as { code: string }).code === "OPERATION_CONFLICT",
        );
      });
      await suite.test("versão concorrente impede sobrescrita silenciosa", async () => {
        const expectedVersion = (await getSnapshot(headers[0])).version;
        const results = await Promise.allSettled(
          [2, 3].map((number) =>
            runCommand(
              headers[0],
              {
                action: "table.save",
                payload: { number, capacity: 4, sector: "Salão", active: true },
                operationId: randomUUID(),
                expectedVersion,
              },
              applyCommand,
            ),
          ),
        );
        assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
        assert.equal(results.filter((result) => result.status === "rejected").length, 1);
        assert.equal((await getSnapshot(headers[0])).tables.length, 2);
      });
      await suite.test("erro após mutação não persiste dados nem operação", async () => {
        const before = await getSnapshot(headers[0]);
        const operationId = randomUUID();
        await assert.rejects(
          runCommand(headers[0], { action: "test.rollback", payload: {}, operationId }, (state) => {
            state.restaurant.name = "Não persistir";
            throw new Error("Falha controlada");
          }),
        );
        const after = await getSnapshot(headers[0]);
        assert.equal(after.restaurant.name, before.restaurant.name);
        assert.equal(after.version, before.version);
        assert.equal(
          (
            await getPool().query(
              "SELECT 1 FROM operation_results WHERE restaurant_id=$1 AND operation_id=$2",
              [tenants[0], operationId],
            )
          ).rowCount,
          0,
        );
      });
      await suite.test(
        "FK composta impede produto referenciando categoria de outra empresa",
        async () => {
          const foreign = await runCommand(
            headers[1],
            {
              action: "category.save",
              payload: { name: "Somente B", active: true },
              operationId: randomUUID(),
            },
            applyCommand,
          );
          await assert.rejects(
            runCommand(
              headers[0],
              { action: "test.foreign", payload: {}, operationId: randomUUID() },
              (state) => {
                state.products.push({
                  id: randomUUID(),
                  categoryId: foreign.result.entityId!,
                  name: "Inválido",
                  description: "",
                  priceCents: 100,
                  station: "direto",
                  active: true,
                  imageUrl: null,
                  tag: "",
                  recipe: [],
                  options: [],
                  recipeVersion: 1,
                });
                return { message: "Não deve confirmar" };
              },
            ),
            (error) => (error as { code: string }).code === "23503",
          );
          assert.equal((await getSnapshot(headers[0])).products.length, 0);
        },
      );
      await suite.test(
        "imagem persiste como bytea e outra conexão recupera os mesmos bytes sem disco",
        async () => {
          const image = await readFile("public/icons/icon-192.png");
          const previousVercel = process.env.VERCEL;
          const previousDirectory = process.env.UPLOAD_DIR;
          let url: string;
          try {
            process.env.VERCEL = "1";
            process.env.UPLOAD_DIR = "/diretorio-inexistente-sem-disco";
            url = await saveFile(tenants[0], image, users[0]);
          } finally {
            if (previousVercel === undefined) delete process.env.VERCEL;
            else process.env.VERCEL = previousVercel;
            if (previousDirectory === undefined) delete process.env.UPLOAD_DIR;
            else process.env.UPLOAD_DIR = previousDirectory;
          }
          const name = url!.split("/").pop()!;
          const connection = new Pool({ connectionString: process.env.DATABASE_URL });
          try {
            const stored = await connection.query(
              "SELECT data,content_type,octet_length(data) AS size FROM uploaded_files WHERE name=$1",
              [name],
            );
            assert.deepEqual(stored.rows[0].data, image);
            assert.equal(stored.rows[0].size, image.length);
            assert.equal(stored.rows[0].content_type, "image/png");
          } finally {
            await connection.end();
          }
          assert.deepEqual((await loadFile(tenants[0], name, users[0])).bytes, image);
          assert.deepEqual(
            (await loadFile(tenants[0], name, users[1])).bytes,
            image,
            "Integrantes do mesmo restaurante leem seus arquivos",
          );
          await assert.rejects(
            loadFile(tenants[1], name, users[1]),
            (error) => (error as { status: number }).status === 404,
          );
          assert.deepEqual(
            (await loadFile(tenants[1], name, users[0])).bytes,
            image,
            "A foto pessoal continua acessível pelo titular ao trocar de restaurante",
          );
          await assert.rejects(
            loadFile(tenants[0], "../imagem.png", users[0]),
            (error) => (error as { status: number }).status === 404,
          );
          const snapshot = JSON.stringify(await getSnapshot(headers[0]));
          assert.ok(
            !snapshot.includes(image.toString("base64")),
            "O snapshot operacional não carrega o conteúdo das fotos",
          );
        },
      );
      await suite.test(
        "uploads inválidos e falha de FK não deixam registros incompletos",
        async () => {
          const before = (
            await getPool().query("SELECT count(*) FROM uploaded_files WHERE restaurant_id=$1", [
              tenants[0],
            ])
          ).rows[0].count;
          await assert.rejects(
            saveFile(tenants[0], Buffer.from("<svg>arquivo inválido</svg>"), users[0]),
            (error) => (error as { status: number }).status === 400,
          );
          await assert.rejects(
            saveFile(tenants[0], Buffer.alloc(MAX_IMAGE_BYTES + 1), users[0]),
            (error) => (error as { status: number }).status === 413,
          );
          const image = await readFile("public/icons/icon-192.png");
          await assert.rejects(
            saveFile(tenants[0], image, randomUUID()),
            (error) => (error as { code: string }).code === "23503",
          );
          assert.equal(
            (
              await getPool().query("SELECT count(*) FROM uploaded_files WHERE restaurant_id=$1", [
                tenants[0],
              ])
            ).rows[0].count,
            before,
          );
          const name = `${randomUUID()}.png`;
          await getPool().query(
            "INSERT INTO uploaded_files(name,restaurant_id,owner_id,content_type) VALUES($1,$2,$3,'image/png')",
            [name, tenants[0], users[0]],
          );
          await assert.rejects(
            loadFile(tenants[0], name, users[0]),
            (error) => (error as { status: number }).status === 404,
            "Metadado antigo só é servido depois da importação do conteúdo",
          );
          await assert.rejects(
            getPool().query("UPDATE uploaded_files SET data=$1 WHERE name=$2", [
              Buffer.alloc(MAX_IMAGE_BYTES + 1),
              name,
            ]),
            (error) => (error as { code: string }).code === "23514",
          );
        },
      );
      await suite.test("último gestor ativo não pode ser desativado", async () => {
        const snapshot = await getSnapshot(headers[0]);
        await assert.rejects(
          saveTeamMember(headers[0], {
            memberId: snapshot.actor.memberId,
            name: snapshot.profile.name,
            email: emails[0],
            role: "garcom",
            active: true,
          }),
          (error) => (error as { code: string }).code === "LAST_MANAGER",
        );
      });
      await suite.test("convite existente preserva senha e só destinatário aceita", async () => {
        const result = await saveTeamMember(headers[0], {
          name: "Não altera identidade global",
          email: emails[1],
          password: "NaoPodeResetar123!",
          role: "garcom",
          active: true,
        });
        assert.ok("inviteUrl" in result);
        const token = new URL(result.inviteUrl!, origin).searchParams.get("token")!;
        await assert.rejects(
          acceptInvitation(headers[0], token),
          (error) => (error as { code: string }).code === "INVITATION_EMAIL",
        );
        await acceptInvitation(headers[1], token);
        const authenticated = await getAuth().api.signInEmail({
          body: { email: emails[1], password },
          headers: new Headers({ origin }),
          asResponse: true,
        });
        assert.equal(authenticated.status, 200);
        const cross = new Headers(headers[1]);
        cross.set("x-restaurant-id", tenants[0]);
        assert.equal((await getSnapshot(cross)).actor.role, "garcom");
        assert.equal(
          (await getSnapshot(cross)).team.length,
          1,
          "Atendente só recebe seu próprio registro de equipe",
        );
        const operation = await getPool().query(
          "SELECT operation_id FROM operation_results WHERE restaurant_id=$1 AND user_id=$2 LIMIT 1",
          [tenants[0], users[0]],
        );
        assert.equal(
          (await getOperationResult(cross, operation.rows[0].operation_id)).found,
          false,
          "Outro autor não consulta o resultado, mesmo no mesmo restaurante",
        );
      });
      await suite.test("cadastro com slug duplicado não deixa identidade órfã", async () => {
        const snapshot = await getSnapshot(headers[0]);
        const email = `rollback-${suffix}@integration.test`;
        await assert.rejects(
          onboardRestaurant(new Headers({ origin }), {
            name: "Novo gestor",
            email,
            password,
            restaurantName: "Duplicado",
            slug: snapshot.restaurant.slug,
            plan: "teste",
            serviceRateBps: 0,
            reservationMinutes: 60,
            deliveryFeeCents: 0,
          }),
        );
        assert.equal(
          (await getPool().query('SELECT id FROM "user" WHERE email=$1', [email])).rowCount,
          0,
        );
      });
      await suite.test(
        "fluxo persistido integra grupo, preparo parcial, estoque e pagamentos mistos",
        async () => {
          const dispatch = async (action: string, payload: Record<string, unknown>) =>
            runCommand(headers[0], { action, payload, operationId: randomUUID() }, applyCommand);
          const category = (
            await dispatch("category.save", { name: "Pratos integração", active: true })
          ).result.entityId!;
          const stock = (
            await dispatch("stock.save", {
              name: "Ingrediente integração",
              unit: "un",
              minimumMilli: 1000,
              active: true,
            })
          ).result.entityId!;
          await dispatch("stock.entry", {
            stockItemId: stock,
            quantityMilli: 10000,
            costCents: 1000,
            reason: "Compra de teste",
          });
          const product = (
            await dispatch("product.save", {
              categoryId: category,
              name: "Prato integração",
              priceCents: 1001,
              station: "cozinha",
              active: true,
              recipe: [{ stockItemId: stock, quantityMilli: 1000 }],
              options: [
                {
                  name: "Porção menor",
                  priceCents: 0,
                  recipe: [{ stockItemId: stock, quantityMilli: -500 }],
                },
              ],
            })
          ).result.entityId!;
          const initial = await getSnapshot(headers[0]);
          const tableIds = initial.tables.map((table) => table.id);
          const first = (
            await dispatch("visit.open", { tableIds: [tableIds[0]], channel: "salao", people: 2 })
          ).result.entityId!;
          await dispatch("visit.open", { tableIds: [tableIds[1]], channel: "salao", people: 1 });
          const group = (
            await dispatch("group.join", { tableIds, mode: "unica", label: "Grupo integração" })
          ).result.entityId!;
          let state = await getSnapshot(headers[0]);
          const tabId = state.tabs.find((tab) => tab.visitId === first)!.id;
          const itemId = (
            await dispatch("item.add", {
              tabId,
              productId: product,
              quantity: 2,
              notes: "Teste parcial",
            })
          ).result.entityId!;
          await dispatch("order.send", { tabIds: [tabId] });
          state = await getSnapshot(headers[0]);
          assert.equal(state.stockItems.find((item) => item.id === stock)!.reservedMilli, 2000);
          for (const action of ["item.start", "item.ready", "item.deliver"])
            await dispatch(action, { itemId, quantity: 1 });
          await dispatch("item.cancel", {
            itemId,
            quantity: 1,
            reason: "Cliente removeu unidade não iniciada",
          });
          state = await getSnapshot(headers[0]);
          assert.equal(state.stockItems.find((item) => item.id === stock)!.quantityMilli, 9000);
          assert.equal(state.stockItems.find((item) => item.id === stock)!.reservedMilli, 0);
          assert.equal(state.items.find((item) => item.id === itemId)!.status, "entregue");
          await dispatch("cash.open", { openingCents: 0, label: "Caixa integração" });
          await dispatch("payment.record", { tabIds: [tabId], method: "pix", amountCents: 1000 });
          await dispatch("group.split", { groupId: group });
          state = await getSnapshot(headers[0]);
          const due = tabTotals(state, tabId).balanceCents;
          assert.equal(due, 101);
          await dispatch("payment.record", {
            tabIds: [tabId],
            method: "credito",
            amountCents: due,
          });
          await dispatch("tab.close", { tabId });
          await dispatch("visit.close", { visitId: first });
          state = await getSnapshot(headers[0]);
          assert.equal(tabTotals(state, tabId).balanceCents, 0);
          assert.equal(state.visits.find((visit) => visit.id === first)!.closedAt !== null, true);
          const persisted = await getPool().query(
            "SELECT COUNT(*) AS count FROM payment_allocations WHERE restaurant_id=$1 AND tab_id=$2",
            [tenants[0], tabId],
          );
          assert.equal(Number(persisted.rows[0].count), 2);
          const waiterHeaders = new Headers(headers[1]);
          waiterHeaders.set("x-restaurant-id", tenants[0]);
          const waiter = await getSnapshot(waiterHeaders);
          assert.equal(
            tabTotals(waiter, tabId).balanceCents,
            0,
            "Comanda fechada mantém saldo correto para o atendimento",
          );
          assert.equal(waiter.cashSessions.length, 0);
          assert.equal(waiter.stockItems.length, 0);
          assert.ok(waiter.products.every((product) => product.recipe.length === 0));
        },
      );
      await suite.test("cadastro completo cria vínculo e devolve sessão válida", async () => {
        const email = `onboard-${suffix}@integration.test`;
        const response = await onboardRestaurant(new Headers({ origin }), {
          name: "Gestor cadastrado",
          email,
          password,
          restaurantName: "Cadastro atômico",
          slug: `onboard-${suffix}`,
          plan: "teste",
          serviceRateBps: 800,
          reservationMinutes: 60,
          deliveryFeeCents: 500,
        });
        const body = await response.json();
        tenants.push(body.restaurantId);
        const created = await getPool().query('SELECT id FROM "user" WHERE email=$1', [email]);
        users.push(created.rows[0].id);
        assert.equal(response.status, 201);
        const onboardHeaders = new Headers({
          origin,
          cookie: response.headers
            .getSetCookie()
            .map((cookie) => cookie.split(";")[0])
            .join("; "),
        });
        const snapshot = await getSnapshot(onboardHeaders);
        assert.equal(snapshot.restaurant.id, body.restaurantId);
        assert.equal(snapshot.actor.role, "gestor");
        assert.equal(snapshot.restaurant.serviceRateBps, 800);
      });
      await suite.test(
        "credencial provisória bloqueia operações até troca pelo titular",
        async () => {
          const email = `temporary-${suffix}@integration.test`;
          await saveTeamMember(headers[0], {
            name: "Pessoa temporária",
            email,
            password,
            role: "garcom",
            active: true,
          });
          const created = await getPool().query('SELECT id FROM "user" WHERE email=$1', [email]);
          users.push(created.rows[0].id);
          const response = await getAuth().api.signInEmail({
            body: { email, password },
            headers: new Headers({ origin }),
            asResponse: true,
          });
          const temporaryHeaders = new Headers({
            origin,
            cookie: response.headers
              .getSetCookie()
              .map((cookie) => cookie.split(";")[0])
              .join("; "),
            "x-restaurant-id": tenants[0],
          });
          assert.equal((await getSnapshot(temporaryHeaders)).team[0].mustChangePassword, true);
          await assert.rejects(
            runCommand(
              temporaryHeaders,
              { action: "visit.open", payload: { channel: "balcao" }, operationId: randomUUID() },
              applyCommand,
            ),
            (error) => (error as { code: string }).code === "PASSWORD_CHANGE_REQUIRED",
          );
          const changed = await updateProfile(temporaryHeaders, {
            name: "Pessoa com senha própria",
            currentPassword: password,
            newPassword: "NovaSenhaTitular123!",
          });
          const cookieMap = new Map(
            (temporaryHeaders.get("cookie") || "").split("; ").map((cookie) => {
              const index = cookie.indexOf("=");
              return [cookie.slice(0, index), cookie.slice(index + 1)];
            }),
          );
          for (const cookie of changed.cookies) {
            const pair = cookie.split(";")[0];
            const index = pair.indexOf("=");
            cookieMap.set(pair.slice(0, index), pair.slice(index + 1));
          }
          temporaryHeaders.set(
            "cookie",
            [...cookieMap].map(([key, value]) => `${key}=${value}`).join("; "),
          );
          assert.equal((await getSnapshot(temporaryHeaders)).team[0].mustChangePassword, false);
          const visit = await runCommand(
            temporaryHeaders,
            {
              action: "visit.open",
              payload: { channel: "balcao", people: 1 },
              operationId: randomUUID(),
            },
            applyCommand,
          );
          assert.ok(visit.result.entityId);
        },
      );
      await suite.test(
        "recuperação gera correio privado, troca a senha e invalida sessões anteriores",
        async () => {
          const email = `recovery-${suffix}@integration.test`;
          const recoveryId = await transaction((client) =>
            insertIdentity(client, { name: "Recuperação QA", email, passwordHash }),
          );
          users.push(recoveryId);
          const signed = await getAuth().api.signInEmail({
            body: { email, password },
            headers: new Headers({ origin }),
            asResponse: true,
          });
          assert.equal(signed.status, 200);
          const oldSession = new Headers({
            origin,
            cookie: signed.headers
              .getSetCookie()
              .map((cookie) => cookie.split(";")[0])
              .join("; "),
          });
          const requested = await getAuth().api.requestPasswordReset({
            body: { email, redirectTo: `${origin}/recuperar` },
            headers: new Headers({ origin }),
            asResponse: true,
          });
          assert.equal(requested.status, 200);
          const mail = await getPool().query(
            "SELECT body FROM mail_outbox WHERE recipient=$1 ORDER BY id DESC LIMIT 1",
            [email],
          );
          assert.equal(mail.rowCount, 1);
          const link = new URL(mail.rows[0].body.match(/https?:\/\/\S+/)[0]);
          assert.equal(link.origin, origin);
          const token = decodeURIComponent(link.pathname.split("/").at(-1)!);
          const changed = await getAuth().api.resetPassword({
            body: { token, newPassword: "RecoveredTavo123!" },
            headers: new Headers({ origin }),
            asResponse: true,
          });
          assert.equal(changed.status, 200);
          assert.equal(await getAuth().api.getSession({ headers: oldSession }), null);
          assert.equal(
            (
              await getAuth().api.signInEmail({
                body: { email, password },
                headers: new Headers({ origin }),
                asResponse: true,
              })
            ).status,
            401,
          );
          assert.equal(
            (
              await getAuth().api.signInEmail({
                body: { email, password: "RecoveredTavo123!" },
                headers: new Headers({ origin }),
                asResponse: true,
              })
            ).status,
            200,
          );
          assert.notEqual(
            (
              await getAuth().api.resetPassword({
                body: { token, newPassword: "ReusedTavo123!" },
                headers: new Headers({ origin }),
                asResponse: true,
              })
            ).status,
            200,
          );
        },
      );
      await suite.test("cadastro tem limite persistente por origem de rede", async () => {
        const request = new Request(`${origin}/api/account/onboard`, {
          headers: { origin, "x-forwarded-for": `integration-${suffix}` },
        });
        for (let i = 0; i < 15; i++) await accountRateLimit(request);
        await assert.rejects(
          accountRateLimit(request),
          (error) => (error as { status: number }).status === 429,
        );
        await getPool().query('DELETE FROM "rateLimit" WHERE key=$1', [
          `tavo-account:integration-${suffix}`,
        ]);
      });
    } finally {
      await transaction(async (client) => {
        await client.query("SET CONSTRAINTS ALL DEFERRED");
        for (const table of [
          "uploaded_files",
          "recipe_components",
          "item_recipe_components",
          "payment_allocations",
          "refund_allocations",
          "reservation_tables",
          "operation_results",
          "invitations",
          ...Object.values(collections),
          "memberships",
        ])
          await client.query(`DELETE FROM ${table} WHERE restaurant_id=ANY($1::text[])`, [tenants]);
        await client.query("DELETE FROM restaurants WHERE id=ANY($1::text[])", [tenants]);
        await client.query('DELETE FROM "user" WHERE id=ANY($1::text[])', [users]);
        await client.query("DELETE FROM mail_outbox WHERE recipient LIKE $1", [
          `%${suffix}@integration.test`,
        ]);
      });
      await closePool();
    }
  },
);
