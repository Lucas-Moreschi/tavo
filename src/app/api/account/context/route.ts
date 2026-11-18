import { getIdentity } from "@/server/access";
import { getPool } from "@/server/db";
import { restaurantCookie } from "@/server/onboard";
import { errorResponse, requireSameOrigin } from "@/server/http";
import { AppError } from "@/shared/lib/errors";

export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const identity = await getIdentity(request.headers);
    const rows = await getPool().query(
      "SELECT r.id,r.body->>'name' AS name,m.role FROM memberships m JOIN restaurants r ON r.id=m.restaurant_id WHERE m.user_id=$1 AND m.active=true ORDER BY r.body->>'name'",
      [identity.user.id],
    );
    return Response.json(rows.rows);
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const identity = await getIdentity(request.headers);
    const { restaurantId } = await request.json();
    const found = await getPool().query(
      "SELECT id FROM memberships WHERE user_id=$1 AND restaurant_id=$2 AND active=true",
      [identity.user.id, restaurantId],
    );
    if (!found.rowCount) throw new AppError("Acesso não autorizado.", 403, "FORBIDDEN");
    return Response.json(
      { message: "Restaurante selecionado." },
      { headers: { "Set-Cookie": restaurantCookie(restaurantId) } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
