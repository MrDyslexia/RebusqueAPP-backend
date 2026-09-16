import { and, eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { turnos, usuarios, sucursales } from "../../db/schema.js";
import { AppError, Errors } from "../../lib/errors.js";
import type { AuthUser } from "../../plugins/auth.js";

function requireAdmin(actor: AuthUser) {
  if (actor.rol !== "administrador") {
    throw Errors.forbidden("Solo administrador puede administrar turnos");
  }
}

async function validarConductorYSucursal(conductorId: number, sucursalId: number) {
  const [conductor] = await db
    .select({ id: usuarios.id })
    .from(usuarios)
    .where(and(eq(usuarios.id, conductorId), eq(usuarios.rol, "conductor"), eq(usuarios.activo, true)))
    .limit(1);
  if (!conductor) throw new AppError(400, "conductor_invalido", "El conductor indicado no existe o no esta activo");

  const [sucursal] = await db
    .select({ id: sucursales.id })
    .from(sucursales)
    .where(and(eq(sucursales.id, sucursalId), eq(sucursales.activa, true)))
    .limit(1);
  if (!sucursal) throw new AppError(400, "sucursal_invalida", "La sucursal indicada no existe o no esta activa");
}

function validarHorario(horaInicio: string, horaFin: string) {
  if (horaFin <= horaInicio) {
    throw new AppError(400, "horario_invalido", "hora_fin debe ser posterior a hora_inicio");
  }
}

export async function crearTurno(
  actor: AuthUser,
  input: { conductorId: number; sucursalId: number; fecha: string; horaInicio: string; horaFin: string }
) {
  requireAdmin(actor);
  validarHorario(input.horaInicio, input.horaFin);
  await validarConductorYSucursal(input.conductorId, input.sucursalId);

  const [nuevo] = await db
    .insert(turnos)
    .values({
      conductorId: input.conductorId,
      sucursalId: input.sucursalId,
      fecha: input.fecha,
      horaInicio: input.horaInicio,
      horaFin: input.horaFin,
    })
    .returning();

  return nuevo!;
}

export async function obtenerTurno(id: number) {
  const [turno] = await db.select().from(turnos).where(eq(turnos.id, id)).limit(1);
  if (!turno) throw Errors.notFound("Turno");
  return turno;
}

export async function listarTurnos(
  actor: AuthUser,
  filtro: { conductorId?: number; sucursalId?: number; fecha?: string }
) {
  const condiciones = [];

  // El conductor solo ve sus propios turnos, sin importar que filtro mande.
  const conductorId = actor.rol === "conductor" ? actor.id : filtro.conductorId;
  if (conductorId) condiciones.push(eq(turnos.conductorId, conductorId));
  if (filtro.sucursalId) condiciones.push(eq(turnos.sucursalId, filtro.sucursalId));
  if (filtro.fecha) condiciones.push(eq(turnos.fecha, filtro.fecha));

  return db
    .select()
    .from(turnos)
    .where(condiciones.length > 0 ? and(...condiciones) : undefined);
}

export async function actualizarTurno(
  actor: AuthUser,
  id: number,
  cambios: Partial<{ conductorId: number; sucursalId: number; fecha: string; horaInicio: string; horaFin: string }>
) {
  requireAdmin(actor);
  const actual = await obtenerTurno(id);

  const horaInicio = cambios.horaInicio ?? actual.horaInicio;
  const horaFin = cambios.horaFin ?? actual.horaFin;
  validarHorario(horaInicio, horaFin);

  await validarConductorYSucursal(cambios.conductorId ?? actual.conductorId, cambios.sucursalId ?? actual.sucursalId);

  await db.update(turnos).set(cambios).where(eq(turnos.id, id));
  return obtenerTurno(id);
}

export async function eliminarTurno(actor: AuthUser, id: number) {
  requireAdmin(actor);
  await obtenerTurno(id);
  await db.delete(turnos).where(eq(turnos.id, id));
}
