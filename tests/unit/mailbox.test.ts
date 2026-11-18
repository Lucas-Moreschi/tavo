import test from "node:test";
import assert from "node:assert/strict";
import { get } from "node:http";
import { startLocalMailbox } from "../../scripts/development/mailbox";

test("correio acadêmico exige URL privada e host local, escapa conteúdo e filtra links", async () => {
  let reads = 0;
  const { server, url } = await startLocalMailbox(
    async () => {
      reads++;
      return [
        {
          recipient: "qa@test.local",
          subject: "<script>alert(1)</script>",
          body: "https://tavo.test/recuperar?token=example https://outro.test/token",
          created_at: "2026-11-16T12:00:00Z",
        },
      ];
    },
    { port: 0, appUrl: "https://tavo.test" },
  );
  try {
    assert.equal((await fetch(new URL("/", url))).status, 403);
    assert.equal((await fetch(url, { headers: { origin: "https://outro.test" } })).status, 403);
    const foreignHost = await new Promise<number>((resolve, reject) => {
      get(url, { headers: { host: "outro.test" } }, (response) => {
        response.resume();
        resolve(response.statusCode!);
      }).on("error", reject);
    });
    assert.equal(foreignHost, 403);
    assert.equal(reads, 0);
    const response = await fetch(url);
    const html = await response.text();
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.ok(!html.includes("<script>"));
    assert.ok(html.includes("&lt;script&gt;"));
    assert.ok(html.includes('href="https://tavo.test/recuperar?token=example"'));
    assert.ok(!html.includes('href="https://outro.test'));
    assert.equal(reads, 1);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
