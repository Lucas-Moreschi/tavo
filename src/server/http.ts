import { AppError } from "@/shared/lib/errors";
import { getPool } from "@/server/db";

export function requireSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const allowed = new URL(process.env.BETTER_AUTH_URL || request.url).origin;
  if (!origin || origin !== allowed)
    throw new AppError("Origem da solicitação não autorizada.", 403, "INVALID_ORIGIN");
}
export async function accountRateLimit(request: Request) {
  const source = (
    request.headers.get("x-forwarded-for") ||
    request.headers.get("x-real-ip") ||
    "local"
  )
    .split(",")[0]
    .trim()
    .slice(0, 100);
  const key = `tavo-account:${source}`;
  const now = Date.now();
  const result = await getPool().query(
    'INSERT INTO "rateLimit"(id,key,count,"lastRequest") VALUES($1,$1,1,$2) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN "rateLimit"."lastRequest"<$2-60000 THEN 1 ELSE "rateLimit".count+1 END,"lastRequest"=CASE WHEN "rateLimit"."lastRequest"<$2-60000 THEN $2 ELSE "rateLimit"."lastRequest" END RETURNING count',
    [key, now],
  );
  if (result.rows[0].count > 15)
    throw new AppError(
      "Muitas tentativas. Aguarde um minuto e tente novamente.",
      429,
      "RATE_LIMITED",
    );
}
export function errorResponse(error: unknown) {
  if (error instanceof AppError)
    return Response.json({ erro: error.message, code: error.code }, { status: error.status });
  const dbError = error as { code?: string };
  if (dbError?.code === "23505")
    return Response.json(
      { erro: "Já existe um registro com esses dados.", code: "CONFLICT" },
      { status: 409 },
    );
  if (dbError?.code === "23503" || dbError?.code === "23514")
    return Response.json(
      { erro: "Os registros ou valores informados são incompatíveis.", code: "INVALID_RELATION" },
      { status: 409 },
    );
  console.error("Falha interna TAVO", error instanceof Error ? error.message : "erro desconhecido");
  return Response.json(
    {
      erro: "Não foi possível concluir. Verifique a conexão e tente novamente.",
      code: "INTERNAL_ERROR",
    },
    { status: 500 },
  );
}
