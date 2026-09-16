import fp from "fastify-plugin";
import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { eq, and, gt, isNull } from "drizzle-orm";
import { db } from "../db/index.js";
import { sesiones, usuarios } from "../db/schema.js";
import { hashToken } from "../lib/security.js";
import { Errors } from "../lib/errors.js";

export interface AuthUser {
  id: number;
  rut: string;
  email: string;
  rol: "cliente" | "conductor" | "ejecutivo" | "administrador";
  sesionId: number;
}

declare module "fastify" {
  interface FastifyRequest {
    user?: AuthUser;
  }
  interface FastifyInstance {
    authenticate: (request: FastifyRequest) => Promise<void>;
    requireRole: (...roles: AuthUser["rol"][]) => (request: FastifyRequest) => Promise<void>;
  }
}

export async function resolveUserFromToken(rawToken: string): Promise<AuthUser | null> {
  const tokenHash = hashToken(rawToken);

  const rows = await db
    .select({
      sesionId: sesiones.id,
      usuarioId: usuarios.id,
      rut: usuarios.rut,
      email: usuarios.email,
      rol: usuarios.rol,
      activo: usuarios.activo,
    })
    .from(sesiones)
    .innerJoin(usuarios, eq(sesiones.usuarioId, usuarios.id))
    .where(
      and(eq(sesiones.token, tokenHash), isNull(sesiones.revokedAt), gt(sesiones.expiresAt, new Date().toISOString()))
    )
    .limit(1);

  const row = rows[0];
  if (!row || !row.activo) return null;

  return {
    id: row.usuarioId,
    rut: row.rut,
    email: row.email,
    rol: row.rol,
    sesionId: row.sesionId,
  };
}

const authPlugin: FastifyPluginAsync = async (app) => {
  app.decorate("authenticate", async (request: FastifyRequest) => {
    const header = request.headers.authorization;
    const rawToken = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;
    if (!rawToken) throw Errors.unauthorized();

    const user = await resolveUserFromToken(rawToken);
    if (!user) throw Errors.unauthorized();

    request.user = user;
  });

  app.decorate("requireRole", (...roles: AuthUser["rol"][]) => {
    return async (request: FastifyRequest) => {
      if (!request.user) throw Errors.unauthorized();
      if (!roles.includes(request.user.rol)) throw Errors.forbidden();
    };
  });
};

export default fp(authPlugin, { name: "auth-plugin" });
