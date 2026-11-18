import { requireActor } from "@/server/access";
import { saveFile } from "@/server/files";
import { errorResponse, requireSameOrigin } from "@/server/http";
import { AppError } from "@/shared/lib/errors";
import { MAX_IMAGE_BYTES } from "@/server/image-validation";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const actor = await requireActor(request.headers);
    const length = Number(request.headers.get("content-length"));
    if (length > 3.2 * 1024 * 1024) throw new AppError("A imagem deve ter até 3 MB", 413);
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new AppError("Selecione uma imagem");
    if (file.size > MAX_IMAGE_BYTES) throw new AppError("A imagem deve ter até 3 MB", 413);
    return Response.json({
      url: await saveFile(
        actor.restaurantId,
        new Uint8Array(await file.arrayBuffer()),
        actor.userId,
      ),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
