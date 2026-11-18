import { updateProfile } from "@/server/access";
import { errorResponse, requireSameOrigin } from "@/server/http";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const { cookies, ...result } = await updateProfile(request.headers, await request.json());
    const response = Response.json(result);
    for (const cookie of cookies) response.headers.append("Set-Cookie", cookie);
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
