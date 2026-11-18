import { getPool, closePool } from "../../src/server/db";
import { startLocalMailbox, type LocalMail } from "./mailbox";

try {
  process.loadEnvFile();
} catch {
  /* Ambiente pode ser injetado. */
}

async function main() {
  const filter = process.argv
    .find((argument) => argument.startsWith("--email="))
    ?.slice(8)
    .toLowerCase();
  const port = Number(process.env.LOCAL_MAIL_PORT || 8025);
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error("LOCAL_MAIL_PORT deve estar entre 1024 e 65535.");
  const mailbox = await startLocalMailbox(
    async () => {
      const result = await getPool().query<LocalMail>(
        "SELECT recipient,subject,body,created_at FROM mail_outbox WHERE ($1::text IS NULL OR lower(recipient)=$1) ORDER BY created_at DESC LIMIT 100",
        [filter || null],
      );
      return result.rows;
    },
    { port, appUrl: process.env.BETTER_AUTH_URL || process.env.APP_URL || "http://localhost:3000" },
  );
  console.log(`Correio local: ${mailbox.url}`);
  console.log("Abra o endereço neste computador. Não compartilhe a URL. Ctrl+C para encerrar.");
  const stop = () => {
    mailbox.server.close(() => {
      void closePool().finally(() => process.exit(0));
    });
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
}
main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : error);
  await closePool();
  process.exitCode = 1;
});
