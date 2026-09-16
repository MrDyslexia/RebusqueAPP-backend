import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { sucursales } from "../../db/schema.js";
import { Errors } from "../../lib/errors.js";
import type { AuthUser } from "../../plugins/auth.js";

function requireAdmin(actor: AuthUser) {
  if (actor.rol !== "administrador") {
    throw Errors.forbidden("Solo administrador puede administrar sucursales");
  }
}

export async function crearSucursal(actor: AuthUser, nombre: string, direccion: string) {
  requireAdmin(actor);
  const [nueva] = await db.insert(sucursales).values({ nombre, direccion }).returning();
  return nueva!;
}

export async function listarSucursales(activa?: boolean) {
  if (activa === undefined) return db.select().from(sucursales);
  return db.select().from(sucursales).where(eq(sucursales.activa, activa));
}

export async function obtenerSucursal(id: number) {
  const [sucursal] = await db.select().from(sucursales).where(eq(sucursales.id, id)).limit(1);
  if (!sucursal) throw Errors.notFound("Sucursal");
  return sucursal;
}

export async function actualizarSucursal(
  actor: AuthUser,
  id: number,
  cambios: { nombre?: string; direccion?: string; activa?: boolean }
) {
  requireAdmin(actor);
  await obtenerSucursal(id);

  await db.update(sucursales).set(cambios).where(eq(sucursales.id, id));
  return obtenerSucursal(id);
}
