import { getPool } from "@/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    await getPool().query("SELECT 1");
    return Response.json({ status: "ok", database: "connected" });
  } catch {
    return Response.json({ status: "unavailable" }, { status: 503 });
  }
}
