import { onboardRestaurant } from "@/server/onboard";
import { accountRateLimit, errorResponse, requireSameOrigin } from "@/server/http";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    await accountRateLimit(request);
    return await onboardRestaurant(request.headers, await request.json());
  } catch (error) {
    return errorResponse(error);
  }
}
