import { betterAuth } from "better-auth";
import { getPool } from "@/server/db";

function createAuth() {
  if (!process.env.BETTER_AUTH_SECRET || process.env.BETTER_AUTH_SECRET.length < 32)
    throw new Error("Configure BETTER_AUTH_SECRET com pelo menos 32 caracteres.");
  return betterAuth({
    database: getPool(),
    secret: process.env.BETTER_AUTH_SECRET,
    baseURL: process.env.BETTER_AUTH_URL || "http://localhost:3000",
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        await getPool().query(
          "INSERT INTO mail_outbox (recipient, subject, body) VALUES ($1,$2,$3)",
          [
            user.email,
            "TAVO — recuperação de acesso",
            `Abra o endereço para recuperar sua senha: ${url}`,
          ],
        );
      },
      onPasswordReset: async ({ user }) => {
        await getPool().query(
          'WITH cleared AS (UPDATE memberships SET must_change_password=false WHERE user_id=$1) UPDATE "user" SET credential_temporary=false WHERE id=$1',
          [user.id],
        );
      },
    },
    session: { expiresIn: 60 * 60 * 12, updateAge: 60 * 30, cookieCache: { enabled: false } },
    advanced: {
      useSecureCookies:
        new URL(process.env.BETTER_AUTH_URL || "http://localhost:3000").protocol === "https:",
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: "lax",
        secure:
          new URL(process.env.BETTER_AUTH_URL || "http://localhost:3000").protocol === "https:",
      },
    },
    rateLimit: { enabled: true, storage: "database", window: 60, max: 50 },
  });
}
let authInstance: ReturnType<typeof createAuth> | undefined;
export function getAuth() {
  return (authInstance ??= createAuth());
}
