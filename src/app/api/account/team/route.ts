import { getTeam, requireActor, saveTeamMember } from "@/server/access";
import { errorResponse, requireSameOrigin } from "@/server/http";

export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    return Response.json(await getTeam(await requireActor(request.headers)));
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    return Response.json(await saveTeamMember(request.headers, await request.json()));
  } catch (error) {
    return errorResponse(error);
  }
}
