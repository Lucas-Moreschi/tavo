import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { z } from "zod";
import { AppError } from "@/shared/lib/errors";
import type { Restaurant } from "@/domain/types";
import { getAuth } from "@/server/auth";
import { insertIdentity } from "@/server/access";
import { transaction } from "@/server/db";

const schema = z.object({
  name: z.string().trim().min(3).max(100),
  email: z.email().transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(128),
  restaurantName: z.string().trim().min(2).max(100),
  slug: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .min(3)
    .max(60),
  plan: z.string().trim().min(1).max(60),
  serviceRateBps: z.number().int().min(0).max(10000),
  reservationMinutes: z.number().int().min(15).max(480).default(90),
  deliveryFeeCents: z.number().int().min(0).max(1000000).default(0),
});
export function restaurantCookie(restaurantId: string) {
  return `tavo-restaurant=${encodeURIComponent(restaurantId)}; Path=/; HttpOnly; SameSite=Lax${new URL(process.env.BETTER_AUTH_URL || "http://localhost:3000").protocol === "https:" ? "; Secure" : ""}; Max-Age=43200`;
}
export async function onboardRestaurant(headers: Headers, input: unknown): Promise<Response> {
  const parsed = schema.safeParse(input);
  if (!parsed.success)
    throw new AppError(
      "Confira os dados do restaurante e a taxa de serviço. A senha precisa ter pelo menos 8 caracteres.",
    );
  const data = parsed.data;
  const logged = await getAuth().api.getSession({ headers });
  const passwordHash = await hashPassword(data.password);
  const restaurantId = await transaction(async (client) => {
    const existing = await client.query('SELECT id,email FROM "user" WHERE lower(email)=$1', [
      data.email,
    ]);
    let userId: string;
    if (existing.rows[0]) {
      if (logged?.user.id !== existing.rows[0].id)
        throw new AppError(
          "Entre com sua conta existente antes de cadastrar outro restaurante com este e-mail.",
          409,
          "SIGN_IN_REQUIRED",
        );
      userId = existing.rows[0].id;
    } else
      userId = await insertIdentity(client, { name: data.name, email: data.email, passwordHash });
    const restaurant: Restaurant = {
      id: randomUUID(),
      name: data.restaurantName,
      slug: data.slug,
      plan: data.plan,
      timezone: "America/Sao_Paulo",
      serviceRateBps: data.serviceRateBps,
      reservationMinutes: data.reservationMinutes,
      deliveryFeeCents: data.deliveryFeeCents,
      address: "",
      phone: "",
      createdAt: new Date().toISOString(),
    };
    await client.query("INSERT INTO restaurants(id,slug,body) VALUES($1,$2,$3::jsonb)", [
      restaurant.id,
      restaurant.slug,
      JSON.stringify(restaurant),
    ]);
    await client.query(
      "INSERT INTO memberships(id,restaurant_id,user_id,role) VALUES($1,$2,$3,'gestor')",
      [randomUUID(), restaurant.id, userId],
    );
    return restaurant.id;
  });
  const responseHeaders = new Headers({
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  if (!logged || logged.user.email.toLowerCase() !== data.email) {
    const signedIn = await getAuth().api.signInEmail({
      headers,
      body: { email: data.email, password: data.password },
      asResponse: true,
    });
    if (!signedIn.ok)
      return Response.json(
        { message: "Restaurante cadastrado. Entre com o e-mail e senha informados.", restaurantId },
        { status: 201 },
      );
    for (const cookie of signedIn.headers.getSetCookie())
      responseHeaders.append("Set-Cookie", cookie);
  }
  responseHeaders.append("Set-Cookie", restaurantCookie(restaurantId));
  return new Response(
    JSON.stringify({
      message: "Restaurante cadastrado. Configure seu cardápio e estoque para começar.",
      restaurantId,
    }),
    { status: 201, headers: responseHeaders },
  );
}
