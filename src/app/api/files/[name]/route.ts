import { requireActor } from "@/server/access";
import { loadFile } from "@/server/files";
import { errorResponse } from "@/server/http";

export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ name: string }> }) {
  try {
    const actor = await requireActor(request.headers, true);
    const { name } = await context.params;
    const file = await loadFile(actor.restaurantId, name, actor.userId);
    return new Response(Buffer.from(file.bytes), {
      headers: {
        "Content-Type": file.contentType,
        "Content-Length": String(file.bytes.byteLength),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
