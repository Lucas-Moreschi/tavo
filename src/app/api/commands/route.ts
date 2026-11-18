import { applyCommand } from "@/domain/commands";
import type { Command } from "@/domain/types";
import { AppError } from "@/shared/lib/errors";
import { runCommand } from "@/server/repository";
import { errorResponse, requireSameOrigin } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const content = await request.text();
    if (Buffer.byteLength(content) > 256000) throw new AppError("Solicitação muito grande", 413);
    let command: Command;
    try {
      command = JSON.parse(content);
    } catch {
      throw new AppError("JSON inválido");
    }
    if (!command || !Number.isSafeInteger(command.expectedVersion) || command.expectedVersion! < 0)
      throw new AppError(
        "Atualize os dados antes de confirmar a operação",
        409,
        "VERSION_REQUIRED",
      );
    return Response.json(await runCommand(request.headers, command, applyCommand), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
