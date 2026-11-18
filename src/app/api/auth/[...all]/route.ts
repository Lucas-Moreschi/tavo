import { getAuth } from "@/server/auth";
import { getPool } from "@/server/db";
import { errorResponse } from "@/server/http";

export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    return await getAuth().handler(request);
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    const response = await getAuth().handler(request);
    if (response.ok && new URL(request.url).pathname.endsWith("/change-password")) {
      const session = await getAuth().api.getSession({ headers: request.headers });
      if (session)
        await getPool().query(
          "UPDATE memberships SET must_change_password=false WHERE user_id=$1",
          [session.user.id],
        );
    }
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
