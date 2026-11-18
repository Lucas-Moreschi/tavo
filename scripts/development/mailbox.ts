import { createServer, type Server } from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";

export interface LocalMail {
  recipient: string;
  subject: string;
  body: string;
  created_at: Date | string;
}
const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!,
  );

/** Console local de desenvolvimento. Nunca é importado pela aplicação Next ou publicado como API. */
export async function startLocalMailbox(
  read: () => Promise<LocalMail[]>,
  options: { port?: number; appUrl: string },
): Promise<{ server: Server; url: string }> {
  const secret = randomBytes(32).toString("hex");
  const appOrigin = new URL(options.appUrl).origin;
  const server = createServer(async (request, response) => {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader(
      "Content-Security-Policy",
      "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
    );
    const address = server.address();
    const host = typeof address === "object" && address ? `127.0.0.1:${address.port}` : "";
    const path = (request.url || "").split("?")[0].slice(1);
    const authenticated =
      /^[a-f0-9]{64}$/.test(path) && timingSafeEqual(Buffer.from(path), Buffer.from(secret));
    if (
      request.method !== "GET" ||
      request.headers.host !== host ||
      request.headers.origin ||
      !authenticated ||
      request.headers["sec-fetch-site"] === "cross-site"
    ) {
      response.writeHead(403);
      response.end("Acesso local restrito.");
      return;
    }
    try {
      const messages = await read();
      const cards = messages
        .map((mail) => {
          const links = (mail.body.match(/https?:\/\/[^\s<>"']+/g) || []).filter((url) => {
            try {
              return new URL(url).origin === appOrigin;
            } catch {
              return false;
            }
          });
          return `<article><h2>${escapeHtml(mail.subject)}</h2><p>${escapeHtml(mail.recipient)} · ${escapeHtml(new Date(mail.created_at).toLocaleString("pt-BR"))}</p><pre>${escapeHtml(mail.body)}</pre>${links.map((url) => `<a href="${escapeHtml(url)}" target="_blank" rel="noreferrer noopener">Abrir recuperação de senha</a>`).join("")}</article>`;
        })
        .join("");
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(
        `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>TAVO · Correio local</title><style>body{font:17px system-ui;background:#101010;color:#eee;max-width:1000px;margin:40px auto;padding:20px}article{padding:24px;background:#1b1b1b;border:1px solid #333;border-radius:16px;margin:20px 0}h1{color:#ff782f}h2{font-size:21px}p{color:#bbb}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit}a{color:#ff9a61;display:inline-block;padding:12px 0}</style><h1>Correio local</h1><p>Console restrito ao computador do apresentador. Os links de recuperação são pessoais e expiram. Atualize a página após solicitar uma nova recuperação.</p>${cards || "<p>Nenhuma mensagem encontrada.</p>"}</html>`,
      );
    } catch {
      response.writeHead(500);
      response.end("Não foi possível consultar o correio.");
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? 8025, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Endereço local indisponível.");
  return { server, url: `http://127.0.0.1:${address.port}/${secret}` };
}
