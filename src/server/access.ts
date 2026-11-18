import { createHash, randomBytes, randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { z } from "zod";
import { AppError } from "@/shared/lib/errors";
import type { Actor, Profile, TeamMember } from "@/domain/types";
import { getAuth } from "@/server/auth";
import { getPool, transaction } from "@/server/db";
import type { PoolClient } from "pg";

export const roleSchema = z.enum(["gestor", "garcom", "caixa", "cozinha", "bar"]);
export async function getIdentity(headers: Headers) {
  const session = await getAuth().api.getSession({ headers });
  if (!session) throw new AppError("Faça login para continuar.", 401, "UNAUTHENTICATED");
  return session;
}
export function selectedRestaurant(headers: Headers) {
  const requested = headers.get("x-restaurant-id");
  if (requested) return requested;
  const match = headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("tavo-restaurant="));
  return match ? decodeURIComponent(match.slice("tavo-restaurant=".length)) : undefined;
}
export async function requireActor(headers: Headers, allowTemporary = false): Promise<Actor> {
  const identity = await getIdentity(headers);
  const selected = selectedRestaurant(headers);
  const result = await getPool().query(
    `SELECT m.id,m.restaurant_id,m.role,(m.must_change_password OR u.credential_temporary) AS must_change_password,u.name FROM memberships m JOIN "user" u ON u.id=m.user_id
     WHERE m.user_id=$1 AND m.active=true AND ($2::text IS NULL OR m.restaurant_id=$2) ORDER BY m.created_at,m.id LIMIT 1`,
    [identity.user.id, selected || null],
  );
  const member = result.rows[0];
  if (!member)
    throw new AppError("Seu acesso a este restaurante está indisponível.", 403, "NO_MEMBERSHIP");
  if (member.must_change_password && !allowTemporary)
    throw new AppError(
      "Troque sua senha provisória no perfil antes de operar.",
      403,
      "PASSWORD_CHANGE_REQUIRED",
    );
  return {
    userId: identity.user.id,
    memberId: member.id,
    restaurantId: member.restaurant_id,
    name: member.name,
    role: member.role,
  };
}
export async function getProfile(actor: Actor, client?: PoolClient): Promise<Profile> {
  const result = await (client || getPool()).query(
    'SELECT id,name,email,image FROM "user" WHERE id=$1',
    [actor.userId],
  );
  return result.rows[0];
}
export async function getTeam(actor: Actor, client?: PoolClient): Promise<TeamMember[]> {
  const result = await (client || getPool()).query(
    `SELECT m.id,m.user_id AS "userId",u.name,u.email,m.role,m.active,(m.must_change_password OR u.credential_temporary) AS "mustChangePassword"
     FROM memberships m JOIN "user" u ON u.id=m.user_id WHERE m.restaurant_id=$1 AND ($2::boolean OR m.id=$3) ORDER BY u.name`,
    [actor.restaurantId, actor.role === "gestor", actor.memberId],
  );
  return result.rows;
}
async function lockManager(client: PoolClient, actor: Actor) {
  await client.query("SELECT id FROM restaurants WHERE id=$1 FOR UPDATE", [actor.restaurantId]);
  const current = await client.query(
    "SELECT role,active FROM memberships WHERE id=$1 AND restaurant_id=$2 AND user_id=$3",
    [actor.memberId, actor.restaurantId, actor.userId],
  );
  if (!current.rows[0]?.active || current.rows[0]?.role !== "gestor")
    throw new AppError("Somente o gestor pode gerenciar a equipe.", 403, "FORBIDDEN");
}
async function auditTeam(
  client: PoolClient,
  actor: Actor,
  action: string,
  entityId: string,
  detail: string,
) {
  const event = {
    id: randomUUID(),
    action,
    entityId,
    detail,
    createdAt: new Date().toISOString(),
    createdBy: actor.userId,
    actorName: actor.name,
  };
  await client.query("INSERT INTO audit_events(restaurant_id,id,body) VALUES($1,$2,$3::jsonb)", [
    actor.restaurantId,
    event.id,
    JSON.stringify(event),
  ]);
}
export async function insertIdentity(
  client: PoolClient,
  input: { id?: string; name: string; email: string; passwordHash: string; temporary?: boolean },
) {
  const id = input.id || randomUUID();
  await client.query(
    'INSERT INTO "user"(id,name,email,"emailVerified",credential_temporary) VALUES($1,$2,$3,false,$4)',
    [id, input.name, input.email.toLowerCase(), input.temporary ?? false],
  );
  await client.query(
    'INSERT INTO account(id,"accountId","providerId","userId",password) VALUES($1,$2,\'credential\',$2,$3)',
    [randomUUID(), id, input.passwordHash],
  );
  return id;
}
const teamSchema = z.object({
  memberId: z.string().optional(),
  name: z.string().trim().min(3).max(100),
  email: z.email().transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(128).optional(),
  role: roleSchema,
  active: z.boolean().default(true),
});
export async function saveTeamMember(headers: Headers, input: unknown) {
  const actor = await requireActor(headers);
  const parsed = teamSchema.safeParse(input);
  if (!parsed.success)
    throw new AppError("Informe nome, e-mail, função e senha inicial com pelo menos 8 caracteres.");
  const data = parsed.data;
  const passwordHash = data.password ? await hashPassword(data.password) : undefined;
  return transaction(async (client) => {
    await lockManager(client, actor);
    if (data.memberId) {
      const found = await client.query(
        "SELECT * FROM memberships WHERE id=$1 AND restaurant_id=$2",
        [data.memberId, actor.restaurantId],
      );
      const member = found.rows[0];
      if (!member) throw new AppError("Pessoa não encontrada.", 404, "NOT_FOUND");
      if (member.role === "gestor" && member.active && (!data.active || data.role !== "gestor")) {
        const others = await client.query(
          "SELECT 1 FROM memberships WHERE restaurant_id=$1 AND role='gestor' AND active=true AND id<>$2",
          [actor.restaurantId, data.memberId],
        );
        if (!others.rowCount)
          throw new AppError(
            "O restaurante precisa manter pelo menos um gestor ativo.",
            409,
            "LAST_MANAGER",
          );
      }
      if (data.password)
        throw new AppError(
          "A senha de uma identidade existente só pode ser alterada pela própria pessoa.",
          403,
          "GLOBAL_CREDENTIAL",
        );
      await client.query(
        "UPDATE memberships SET role=$1,active=$2 WHERE id=$3 AND restaurant_id=$4",
        [data.role, data.active, data.memberId, actor.restaurantId],
      );
      await auditTeam(
        client,
        actor,
        "team.update",
        data.memberId,
        `Função: ${data.role}; acesso ${data.active ? "ativo" : "inativo"}`,
      );
      await client.query("UPDATE restaurants SET version=version+1 WHERE id=$1", [
        actor.restaurantId,
      ]);
      return { message: "Acesso da equipe atualizado." };
    }
    const existing = await client.query('SELECT id FROM "user" WHERE lower(email)=$1', [
      data.email,
    ]);
    if (existing.rowCount) {
      const member = await client.query(
        "SELECT id FROM memberships WHERE restaurant_id=$1 AND user_id=$2",
        [actor.restaurantId, existing.rows[0].id],
      );
      if (member.rowCount)
        throw new AppError(
          "Esta pessoa já possui vínculo com o restaurante.",
          409,
          "MEMBERSHIP_EXISTS",
        );
      const token = randomBytes(32).toString("hex");
      const invitationId = randomUUID();
      await client.query(
        "INSERT INTO invitations(id,restaurant_id,email,role,token_hash,expires_at,created_by) VALUES($1,$2,$3,$4,$5,now()+interval '7 days',$6)",
        [
          invitationId,
          actor.restaurantId,
          data.email,
          data.role,
          createHash("sha256").update(token).digest("hex"),
          actor.userId,
        ],
      );
      await auditTeam(
        client,
        actor,
        "team.invite",
        invitationId,
        `Convite para ${data.email}; função ${data.role}`,
      );
      await client.query("UPDATE restaurants SET version=version+1 WHERE id=$1", [
        actor.restaurantId,
      ]);
      return {
        message:
          "A conta já existe. Compartilhe o convite; a pessoa deve entrar e aceitar sem alterar sua senha.",
        inviteUrl: `/convite?token=${token}`,
      };
    }
    if (!passwordHash)
      throw new AppError("Informe uma senha provisória com pelo menos 8 caracteres.");
    const userId = await insertIdentity(client, {
      name: data.name,
      email: data.email,
      passwordHash,
      temporary: true,
    });
    const memberId = randomUUID();
    await client.query(
      "INSERT INTO memberships(id,restaurant_id,user_id,role,active,must_change_password) VALUES($1,$2,$3,$4,$5,true)",
      [memberId, actor.restaurantId, userId, data.role, data.active],
    );
    await auditTeam(
      client,
      actor,
      "team.create",
      memberId,
      `Pessoa cadastrada; função ${data.role}`,
    );
    await client.query("UPDATE restaurants SET version=version+1 WHERE id=$1", [
      actor.restaurantId,
    ]);
    return {
      message: "Pessoa cadastrada. A senha provisória deverá ser trocada no primeiro acesso.",
    };
  });
}
export async function updateProfile(headers: Headers, input: unknown) {
  const identity = await getIdentity(headers);
  const schema = z.object({
    name: z.string().trim().min(3).max(100),
    image: z.string().max(1000).nullable().optional(),
    currentPassword: z.string().optional(),
    newPassword: z.string().min(8).max(128).optional(),
  });
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new AppError("Verifique o nome e os dados da senha.");
  const data = parsed.data;
  let cookies: string[] = [];
  if (data.image && !/^https:\/\//.test(data.image) && !data.image.startsWith("/api/files/"))
    throw new AppError("Escolha uma imagem válida do perfil.");
  if (data.newPassword) {
    if (!data.currentPassword) throw new AppError("Informe sua senha atual.");
    try {
      const response = await getAuth().api.changePassword({
        headers,
        body: {
          currentPassword: data.currentPassword,
          newPassword: data.newPassword,
          revokeOtherSessions: true,
        },
        asResponse: true,
      });
      if (!response.ok) throw new Error("Senha atual inválida");
      cookies = response.headers.getSetCookie();
    } catch {
      throw new AppError("Não foi possível trocar a senha. Confira sua senha atual.");
    }
    await getPool().query("UPDATE memberships SET must_change_password=false WHERE user_id=$1", [
      identity.user.id,
    ]);
    await getPool().query('UPDATE "user" SET credential_temporary=false WHERE id=$1', [
      identity.user.id,
    ]);
  }
  const changeImage = Object.prototype.hasOwnProperty.call(data, "image");
  await getPool().query(
    'UPDATE "user" SET name=$1,image=CASE WHEN $2 THEN $3 ELSE image END,"updatedAt"=now() WHERE id=$4',
    [data.name, changeImage, data.image ?? null, identity.user.id],
  );
  return {
    message: "Perfil atualizado.",
    profile: {
      id: identity.user.id,
      name: data.name,
      email: identity.user.email,
      image: changeImage ? (data.image ?? null) : (identity.user.image ?? null),
    },
    cookies,
  };
}
export async function invitationInfo(token: string) {
  if (token.length !== 64) throw new AppError("Convite inválido.", 404, "NOT_FOUND");
  const result = await getPool().query(
    "SELECT r.body->>'name' AS \"restaurantName\",i.email FROM invitations i JOIN restaurants r ON r.id=i.restaurant_id WHERE i.token_hash=$1 AND i.accepted_at IS NULL AND i.expires_at>now()",
    [createHash("sha256").update(token).digest("hex")],
  );
  if (!result.rows[0]) throw new AppError("Convite expirado ou já utilizado.", 404, "NOT_FOUND");
  return result.rows[0];
}
export async function acceptInvitation(headers: Headers, token: string) {
  const identity = await getIdentity(headers);
  return transaction(async (client) => {
    const found = await client.query(
      "SELECT * FROM invitations WHERE token_hash=$1 AND accepted_at IS NULL AND expires_at>now() FOR UPDATE",
      [createHash("sha256").update(token).digest("hex")],
    );
    const invite = found.rows[0];
    if (!invite) throw new AppError("Convite expirado ou já utilizado.", 404, "NOT_FOUND");
    if (invite.email !== identity.user.email.toLowerCase())
      throw new AppError("Entre com o e-mail destinatário do convite.", 403, "INVITATION_EMAIL");
    await client.query("SELECT id FROM restaurants WHERE id=$1 FOR UPDATE", [invite.restaurant_id]);
    await client.query(
      "INSERT INTO memberships(id,restaurant_id,user_id,role,active) VALUES($1,$2,$3,$4,true) ON CONFLICT(restaurant_id,user_id) DO NOTHING",
      [randomUUID(), invite.restaurant_id, identity.user.id, invite.role],
    );
    await client.query("UPDATE invitations SET accepted_at=now() WHERE id=$1", [invite.id]);
    await client.query("UPDATE restaurants SET version=version+1 WHERE id=$1", [
      invite.restaurant_id,
    ]);
    return { message: "Convite aceito.", restaurantId: invite.restaurant_id };
  });
}
