import { acceptInvitation, invitationInfo } from "@/server/access";
import { restaurantCookie } from "@/server/onboard";
import { errorResponse, requireSameOrigin } from "@/server/http";

export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    return Response.json(
      await invitationInfo(new URL(request.url).searchParams.get("token") || ""),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const result = await acceptInvitation(
      request.headers,
      String((await request.json()).token || ""),
    );
    return Response.json(result, {
      headers: { "Set-Cookie": restaurantCookie(result.restaurantId) },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
