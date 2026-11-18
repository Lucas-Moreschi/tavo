import { randomUUID } from "node:crypto";
import { assert } from "@/shared/lib/errors";
import { getPool } from "@/server/db";
import { IMAGE_NAME, inspectImage } from "@/server/image-validation";

export async function saveFile(restaurantId: string, data: Uint8Array, ownerId: string) {
  const { extension, contentType } = inspectImage(data);
  const name = `${randomUUID()}.${extension}`;
  // Conteúdo e metadados são uma única gravação atômica. O pg envia Buffer como bytea.
  await getPool().query(
    "INSERT INTO uploaded_files(name,restaurant_id,owner_id,content_type,data) VALUES($1,$2,$3,$4,$5)",
    [name, restaurantId, ownerId, contentType, Buffer.from(data)],
  );
  return `/api/files/${name}`;
}

export async function loadFile(restaurantId: string, name: string, userId: string) {
  assert(IMAGE_NAME.test(name), "Arquivo não encontrado", 404);
  const result = await getPool().query<{ data: Buffer | null; content_type: string }>(
    "SELECT data,content_type FROM uploaded_files WHERE name=$1 AND (restaurant_id=$2 OR owner_id=$3)",
    [name, restaurantId, userId],
  );
  const file = result.rows[0];
  assert(file?.data, "Arquivo não encontrado", 404);
  return { bytes: file.data, contentType: file.content_type };
}
