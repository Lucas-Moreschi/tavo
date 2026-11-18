import { AppError, assert } from "@/shared/lib/errors";

export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
export const IMAGE_NAME = /^[a-f0-9-]{36}\.(png|jpg|webp)$/;

export function inspectImage(data: Uint8Array) {
  assert(data.byteLength > 12, "Envie uma imagem JPG, PNG ou WebP válida");
  assert(data.byteLength <= MAX_IMAGE_BYTES, "A imagem deve ter até 3 MB", 413);
  if (
    Buffer.from(data.subarray(0, 8)).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    )
  ) {
    return { extension: "png", contentType: "image/png" } as const;
  }
  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff)
    return { extension: "jpg", contentType: "image/jpeg" } as const;
  if (
    Buffer.from(data.subarray(0, 4)).toString() === "RIFF" &&
    Buffer.from(data.subarray(8, 12)).toString() === "WEBP"
  ) {
    return { extension: "webp", contentType: "image/webp" } as const;
  }
  throw new AppError("Envie uma imagem JPG, PNG ou WebP válida");
}
