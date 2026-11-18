import { getOperationResult } from "@/server/repository";
import { errorResponse } from "@/server/http";

export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    return Response.json(
      await getOperationResult(request.headers, new URL(request.url).searchParams.get("id") || ""),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
