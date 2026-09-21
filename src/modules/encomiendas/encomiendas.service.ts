import { randomBytes } from "node:crypto";
import { and, desc, eq, gte, inArray, lt, sql, getTableColumns } from "drizzle-orm";
import { db } from "../../db/index.js";
import {
  encomiendas,
  encomiendaEstadoHistorial,
  reportesEntregaFallida,
  usuarios,
  notificacionesLog,
} from "../../db/schema.js";
import { normalizeRut } from "../../lib/rut.js";
import { hashPassword } from "../../lib/security.js";
import { generateNumeroSeguimiento, generateCodigoQr } from "../../lib/ids.js";
import { AppError, Errors } from "../../lib/errors.js";
import { broadcastEncomiendaActualizada } from "../../realtime/broadcaster.js";
import { rangoDelDia, fechaEnZona, TIMEZONE } from "../../lib/timezone.js";
import type { AuthUser } from "../../plugins/auth.js";
import type {
  CrearEncomiendaBody,
  estadoPagoSchema,
} from "./encomiendas.schemas.js";
import type { z } from "zod";

type EstadoPago = z.infer<typeof estadoPagoSchema>;
type Estado =
  | "procesando"
  | "asignada"
  | "en_ruta"
  | "retirado"
  | "en_sucursal"
  | "en_reparto"
  | "entregada"
  | "fallida"
  | "finalizada";

const MAX_INTENTOS_FALLIDOS = 3;
const UNIQUE_VIOLATION = "23505";

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === UNIQUE_VIOLATION;
}

function requireEjecutivoOAdmin(actor: AuthUser) {
  if (actor.rol !== "ejecutivo" && actor.rol !== "administrador") {
    throw Errors.forbidden("Solo ejecutivo o administrador pueden realizar esta accion");
  }
}

function requireConductorAsignadoOAdmin(
  actor: AuthUser,
  encomienda: { conductorAsignadoId: number | null }
) {
  if (actor.rol === "administrador") return; // puede operar como conductor (emergencia)
  if (actor.rol === "conductor" && actor.id === encomienda.conductorAsignadoId) return;
  throw Errors.notAssignedConductor();
}

async function obtenerOCrearCliente(actor: AuthUser, rutInput: string, email?: string) {
  const rut = normalizeRut(rutInput);

  const [existente] = await db.select().from(usuarios).where(eq(usuarios.rut, rut)).limit(1);
  if (existente) {
    if (existente.rol !== "cliente") {
      throw new AppError(
        409,
        "rut_no_es_cliente",
        `El RUT ${rut} ya esta registrado con rol '${existente.rol}', no puede ser remitente`
      );
    }
    return existente;
  }

  // Auto-creacion de cuenta cliente (vault: "se crea en el momento si no
  // existe, al ingresar el RUT durante el registro de la encomienda").
  // Email/password no vienen del flujo real (solo se ingresa el RUT) —
  // si el ejecutivo tiene el correo a mano se puede pasar `remitenteEmail`,
  // si no, placeholder derivado del RUT (unico por construccion). Password
  // aleatoria: login de cliente es post-MVP, no se usa en este flujo.
  const finalEmail = email ?? `sin-correo+${rut.replace("-", "")}@elrebusque.cl`;
  const passwordHash = await hashPassword(randomBytes(24).toString("hex"));

  const [nuevo] = await db
    .insert(usuarios)
    .values({ rut, email: finalEmail, passwordHash, rol: "cliente", creadoPor: actor.id })
    .returning();

  return nuevo!;
}

async function insertarConIdsUnicos<T>(
  insertFn: (numeroSeguimiento: string, codigoQr: string) => Promise<T>
): Promise<T> {
  const MAX_INTENTOS = 5;
  for (let intento = 0; intento < MAX_INTENTOS; intento++) {
    try {
      return await insertFn(generateNumeroSeguimiento(), generateCodigoQr());
    } catch (err) {
      if (isUniqueViolation(err) && intento < MAX_INTENTOS - 1) continue;
      throw err;
    }
  }
  throw new AppError(500, "id_generation_failed", "No se pudo generar un identificador unico");
}

export async function crearEncomienda(actor: AuthUser, input: CrearEncomiendaBody) {
  requireEjecutivoOAdmin(actor);

  const remitente = await obtenerOCrearCliente(actor, input.remitenteRut, input.remitenteEmail);

  const encomienda = await insertarConIdsUnicos(async (numeroSeguimiento, codigoQr) => {
    return db.transaction(async (tx) => {
      const [nueva] = await tx
        .insert(encomiendas)
        .values({
          numeroSeguimiento,
          codigoQr,
          remitenteId: remitente.id,
          destinatarioNombre: input.destinatarioNombre,
          destinatarioTelefono: input.destinatarioTelefono,
          destinatarioRut: input.destinatarioRut,
          direccionEnvio: input.direccionEnvio,
          direccionRetiro: input.direccionRetiro,
          sucursalOrigenId: input.sucursalOrigenId,
          sucursalDestinoId: input.sucursalDestinoId,
          totalAPagar: input.totalAPagar.toFixed(2),
          tipoDocumento: input.tipoDocumento,
          formaPago: input.formaPago,
          creadoPor: actor.id,
        })
        .returning();

      await tx.insert(encomiendaEstadoHistorial).values({
        encomiendaId: nueva!.id,
        estado: "procesando",
        cambiadoPor: actor.id,
      });

      return nueva!;
    });
  });

  broadcastEncomiendaActualizada({
    id: encomienda.id,
    numeroSeguimiento: encomienda.numeroSeguimiento,
    estado: encomienda.estado,
    conductorAsignadoId: encomienda.conductorAsignadoId,
  });

  return encomienda;
}

// `foto_entrega` es bytea: nunca va inline en JSON (Buffer serializa como
// {type:"Buffer",data:[...]}, pesado e inutil para un cliente HTTP). Se
// expone como booleano; el binario real se sirve por
// GET /encomiendas/:id/foto-entrega (ver obtenerFotoEntregaBuffer).
function seleccionEncomienda() {
  const { fotoEntrega, ...resto } = getTableColumns(encomiendas);
  return {
    ...resto,
    tieneFotoEntrega: sql<boolean>`${encomiendas.fotoEntrega} is not null`.as("tieneFotoEntrega"),
  };
}

function requirePuedeVerEncomienda(actor: AuthUser, encomienda: { conductorAsignadoId: number | null }) {
  if (actor.rol !== "conductor" || encomienda.conductorAsignadoId === actor.id) return;
  throw Errors.notFound("Encomienda");
}

export async function obtenerEncomienda(id: number, actor?: AuthUser) {
  const [encomienda] = await db
    .select(seleccionEncomienda())
    .from(encomiendas)
    .where(eq(encomiendas.id, id))
    .limit(1);
  if (!encomienda) throw Errors.notFound("Encomienda");
  if (actor) requirePuedeVerEncomienda(actor, encomienda);
  return encomienda;
}

export async function obtenerEncomiendaPorQr(actor: AuthUser, codigoQr: string) {
  const [encomienda] = await db
    .select(seleccionEncomienda())
    .from(encomiendas)
    .where(eq(encomiendas.codigoQr, codigoQr))
    .limit(1);
  if (!encomienda) throw Errors.notFound("Encomienda");
  requirePuedeVerEncomienda(actor, encomienda);
  return encomienda;
}

export async function obtenerFotoEntregaBuffer(id: number, actor?: AuthUser): Promise<Buffer | null> {
  const [row] = await db
    .select({ fotoEntrega: encomiendas.fotoEntrega, conductorAsignadoId: encomiendas.conductorAsignadoId })
    .from(encomiendas)
    .where(eq(encomiendas.id, id))
    .limit(1);
  if (!row) throw Errors.notFound("Encomienda");
  if (actor) requirePuedeVerEncomienda(actor, row);
  return row.fotoEntrega;
}

export async function obtenerFotoEntregaFallidaBuffer(id: number, actor?: AuthUser): Promise<Buffer | null> {
  const encomienda = await obtenerEncomienda(id, actor);

  const [reporte] = await db
    .select({ fotoReporte: reportesEntregaFallida.fotoReporte })
    .from(reportesEntregaFallida)
    .where(eq(reportesEntregaFallida.encomiendaId, encomienda.id))
    .orderBy(desc(reportesEntregaFallida.createdAt))
    .limit(1);

  return reporte?.fotoReporte ?? null;
}

// Punto unico de salida de todas las transiciones de estado: relee la fila
// actualizada y avisa por WebSocket a los clientes conectados que puedan
// verla (misma regla de visibilidad que GET /encomiendas).
async function finalizarConBroadcast(encomiendaId: number) {
  const encomienda = await obtenerEncomienda(encomiendaId);
  broadcastEncomiendaActualizada({
    id: encomienda.id,
    numeroSeguimiento: encomienda.numeroSeguimiento,
    estado: encomienda.estado,
    conductorAsignadoId: encomienda.conductorAsignadoId,
  });
  return encomienda;
}

export async function listarEncomiendas(actor: AuthUser, estado?: Estado) {
  const condiciones = [];
  if (estado) condiciones.push(eq(encomiendas.estado, estado));
  if (actor.rol === "conductor") condiciones.push(eq(encomiendas.conductorAsignadoId, actor.id));

  return db
    .select(seleccionEncomienda())
    .from(encomiendas)
    .where(condiciones.length > 0 ? and(...condiciones) : undefined)
    .orderBy(desc(encomiendas.createdAt));
}

// Historial operativo de un cliente/remitente. Se expone desde el modulo de
// usuarios porque la pantalla parte en una fila de cliente, pero conserva la
// seleccion HTTP de encomiendas para no duplicar (ni exponer foto_entrega).
export async function listarEncomiendasPorRemitente(remitenteId: number) {
  return db
    .select(seleccionEncomienda())
    .from(encomiendas)
    .where(eq(encomiendas.remitenteId, remitenteId))
    .orderBy(desc(encomiendas.createdAt));
}

// Historial operativo de un ejecutivo: son las encomiendas que creó desde el
// panel, no las que eventualmente pueda tener asignadas como conductor.
export async function listarEncomiendasPorCreador(creadoPor: number) {
  return db
    .select(seleccionEncomienda())
    .from(encomiendas)
    .where(eq(encomiendas.creadoPor, creadoPor))
    .orderBy(desc(encomiendas.createdAt));
}

// Estados que representan trabajo activo/no resuelto para un conductor:
// ya tiene la encomienda a su cargo pero todavia no la entrega. Excluye
// "en_sucursal" (espera reasignacion, no es responsabilidad actual suya
// hasta que se la vuelvan a asignar) y "procesando" (todavia sin conductor).
const ESTADOS_PENDIENTES_CONDUCTOR = ["asignada", "en_ruta", "retirado", "en_reparto"] as const;

/**
 * Resumen diario del conductor autenticado: asignadas hoy, entregadas hoy,
 * y pendientes (trabajo activo actual, sin filtro de fecha).
 *
 * Contrato (ver backend.md del vault para el detalle completo):
 * - "Hoy" es el dia calendario en America/Santiago (ver lib/timezone.ts),
 *   nunca UTC ni la zona del cliente que llama.
 * - asignadasHoy/entregadasHoy cuentan EVENTOS de
 *   `encomienda_estado_historial` (no encomiendas distintas): si una
 *   encomienda fue asignada al mismo conductor mas de una vez en el dia
 *   (ej. reintento tras "en_sucursal"), cuenta una vez por cada evento.
 * - Se filtra por el `conductor_asignado_id` ACTUAL de la encomienda, no
 *   por quien la tenia asignada en el momento del evento historico: si fue
 *   reasignada a otro conductor despues, el evento pasado ya no cuenta para
 *   nadie de forma retroactiva (limitacion aceptada del MVP; el historial
 *   no guarda "asignada a quien" por evento, solo el estado y quien hizo el
 *   cambio).
 * - entregadasHoy usa el historial (evento "entregada"), no
 *   `encomiendas.updated_at`: ese campo se pisa con acciones que no cambian
 *   el estado (ej. `PATCH /encomiendas/:id/pago`), asi que no sirve para
 *   saber cuando ocurrio la entrega.
 * - pendientes es el conteo ACTUAL (no tiene "hoy"): trabajo activo del
 *   conductor en este momento, independiente de cuando se asigno.
 */
export async function resumenDiarioConductor(actor: AuthUser) {
  const { inicio, fin } = rangoDelDia();
  const inicioIso = inicio.toISOString();
  const finIso = fin.toISOString();

  const contarEventosHoy = async (estado: Estado) => {
    const [fila] = await db
      .select({ total: sql<number>`count(*)`.mapWith(Number) })
      .from(encomiendaEstadoHistorial)
      .innerJoin(encomiendas, eq(encomiendaEstadoHistorial.encomiendaId, encomiendas.id))
      .where(
        and(
          eq(encomiendaEstadoHistorial.estado, estado),
          eq(encomiendas.conductorAsignadoId, actor.id),
          gte(encomiendaEstadoHistorial.createdAt, inicioIso),
          lt(encomiendaEstadoHistorial.createdAt, finIso)
        )
      );
    return fila?.total ?? 0;
  };

  const [asignadasHoy, entregadasHoy, pendientesFilas] = await Promise.all([
    contarEventosHoy("asignada"),
    contarEventosHoy("entregada"),
    db
      .select({ estado: encomiendas.estado, total: sql<number>`count(*)`.mapWith(Number) })
      .from(encomiendas)
      .where(
        and(eq(encomiendas.conductorAsignadoId, actor.id), inArray(encomiendas.estado, ESTADOS_PENDIENTES_CONDUCTOR))
      )
      .groupBy(encomiendas.estado),
  ]);

  const porEstado: Record<(typeof ESTADOS_PENDIENTES_CONDUCTOR)[number], number> = {
    asignada: 0,
    en_ruta: 0,
    retirado: 0,
    en_reparto: 0,
  };
  let totalPendientes = 0;
  for (const fila of pendientesFilas) {
    const estado = fila.estado as (typeof ESTADOS_PENDIENTES_CONDUCTOR)[number];
    porEstado[estado] = fila.total;
    totalPendientes += fila.total;
  }

  return {
    fecha: fechaEnZona(),
    zonaHoraria: TIMEZONE,
    asignadasHoy,
    entregadasHoy,
    pendientes: { total: totalPendientes, porEstado },
  };
}

async function transicionar(
  encomiendaId: number,
  nuevoEstado: Estado,
  cambiadoPor: number | null,
  comentario?: string,
  extraSet: Record<string, unknown> = {}
) {
  await db.transaction(async (tx) => {
    await tx
      .update(encomiendas)
      .set({ estado: nuevoEstado, updatedAt: new Date().toISOString(), ...extraSet })
      .where(eq(encomiendas.id, encomiendaId));

    await tx.insert(encomiendaEstadoHistorial).values({
      encomiendaId,
      estado: nuevoEstado,
      cambiadoPor,
      comentario,
    });
  });
}

export async function asignarConductor(actor: AuthUser, encomiendaId: number, conductorId: number) {
  requireEjecutivoOAdmin(actor);
  const encomienda = await obtenerEncomienda(encomiendaId);

  if (encomienda.estado !== "procesando" && encomienda.estado !== "en_sucursal") {
    throw Errors.invalidTransition(encomienda.estado, "asignada");
  }

  const [conductor] = await db
    .select()
    .from(usuarios)
    .where(and(eq(usuarios.id, conductorId), eq(usuarios.rol, "conductor"), eq(usuarios.activo, true)))
    .limit(1);
  if (!conductor) throw new AppError(400, "conductor_invalido", "El conductor indicado no existe o no esta activo");

  const requiereRetiro = encomienda.direccionRetiro !== null;
  const vieneDeEnSucursal = encomienda.estado === "en_sucursal";

  await db.transaction(async (tx) => {
    await tx
      .update(encomiendas)
      .set({ conductorAsignadoId: conductorId, estado: "asignada", updatedAt: new Date().toISOString() })
      .where(eq(encomiendas.id, encomiendaId));

    await tx.insert(encomiendaEstadoHistorial).values({
      encomiendaId,
      estado: "asignada",
      cambiadoPor: actor.id,
    });

    // Primera asignacion (viene de "procesando") + requiere retiro: pasa
    // automaticamente a "en ruta" (el conductor debe ir a buscarla). Si
    // viene de "en_sucursal" es reasignacion para reparto post-retiro: se
    // queda en "asignada", el conductor la sube al vehiculo via /cargar.
    if (requiereRetiro && !vieneDeEnSucursal) {
      await tx
        .update(encomiendas)
        .set({ estado: "en_ruta", updatedAt: new Date().toISOString() })
        .where(eq(encomiendas.id, encomiendaId));

      await tx.insert(encomiendaEstadoHistorial).values({
        encomiendaId,
        estado: "en_ruta",
        cambiadoPor: actor.id,
      });
    }
  });

  return finalizarConBroadcast(encomiendaId);
}

export async function recoger(actor: AuthUser, encomiendaId: number) {
  const encomienda = await obtenerEncomienda(encomiendaId);
  requireConductorAsignadoOAdmin(actor, encomienda);

  if (encomienda.direccionRetiro === null) throw Errors.retiroNoRequerido();
  if (encomienda.estado !== "en_ruta") throw Errors.invalidTransition(encomienda.estado, "retirado");

  await transicionar(encomiendaId, "retirado", actor.id);
  return finalizarConBroadcast(encomiendaId);
}

export async function decidirPostRetiro(
  actor: AuthUser,
  encomiendaId: number,
  decision: "mismo_dia" | "sucursal"
) {
  requireEjecutivoOAdmin(actor);
  const encomienda = await obtenerEncomienda(encomiendaId);

  if (encomienda.estado !== "retirado") {
    throw Errors.invalidTransition(encomienda.estado, decision === "mismo_dia" ? "en_reparto" : "en_sucursal");
  }

  const nuevoEstado: Estado = decision === "mismo_dia" ? "en_reparto" : "en_sucursal";
  await transicionar(encomiendaId, nuevoEstado, actor.id, `decision_post_retiro:${decision}`);
  return finalizarConBroadcast(encomiendaId);
}

export async function cargar(actor: AuthUser, encomiendaId: number) {
  const encomienda = await obtenerEncomienda(encomiendaId);
  requireConductorAsignadoOAdmin(actor, encomienda);

  if (encomienda.estado !== "asignada" && encomienda.estado !== "en_sucursal") {
    throw Errors.invalidTransition(encomienda.estado, "en_reparto");
  }

  await transicionar(encomiendaId, "en_reparto", actor.id);
  return finalizarConBroadcast(encomiendaId);
}

export async function entregar(actor: AuthUser, encomiendaId: number, fotoBase64?: string) {
  const encomienda = await obtenerEncomienda(encomiendaId);
  requireConductorAsignadoOAdmin(actor, encomienda);

  if (encomienda.estado !== "en_reparto") throw Errors.invalidTransition(encomienda.estado, "entregada");

  const fotoEntrega = fotoBase64 ? Buffer.from(fotoBase64, "base64") : undefined;
  await transicionar(encomiendaId, "entregada", actor.id, undefined, fotoEntrega ? { fotoEntrega } : {});

  // Notificar al cliente (post-MVP, ver notificaciones.md): solo se deja
  // el registro, el envio real lo hace un worker que aun no existe.
  await db.insert(notificacionesLog).values({
    usuarioId: encomienda.remitenteId,
    encomiendaId,
    canal: "correo",
    evento: "encomienda_entregada",
  });

  return finalizarConBroadcast(encomiendaId);
}

export async function reportarFallida(
  actor: AuthUser,
  encomiendaId: number,
  motivo: string,
  fotoBase64?: string
) {
  const encomienda = await obtenerEncomienda(encomiendaId);
  requireConductorAsignadoOAdmin(actor, encomienda);

  if (encomienda.estado !== "en_reparto") throw Errors.invalidTransition(encomienda.estado, "fallida");

  const conductorId = actor.rol === "administrador" ? encomienda.conductorAsignadoId! : actor.id;
  const fotoReporte = fotoBase64 ? Buffer.from(fotoBase64, "base64") : null;
  const nuevosIntentos = encomienda.intentosFallidos + 1;
  const seFinaliza = nuevosIntentos >= MAX_INTENTOS_FALLIDOS;

  await db.transaction(async (tx) => {
    await tx.insert(reportesEntregaFallida).values({
      encomiendaId,
      conductorId,
      motivo,
      fotoReporte,
    });

    const estadoFinal: Estado = seFinaliza ? "finalizada" : "en_sucursal";

    await tx
      .update(encomiendas)
      .set({
        estado: estadoFinal,
        intentosFallidos: nuevosIntentos,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(encomiendas.id, encomiendaId));

    // "fallida" siempre queda registrada en el historial aunque el estado
    // final de la tabla encomiendas sea en_sucursal/finalizada (el flujo del
    // vault la nombra como paso explicito antes de resolver el reintento).
    await tx.insert(encomiendaEstadoHistorial).values({
      encomiendaId,
      estado: "fallida",
      cambiadoPor: actor.id,
      comentario: motivo,
    });

    if (seFinaliza) {
      await tx.insert(encomiendaEstadoHistorial).values({
        encomiendaId,
        estado: "finalizada",
        cambiadoPor: null, // automatico, no manual
        comentario: `finalizada_automatica_${MAX_INTENTOS_FALLIDOS}_fallas`,
      });

      await tx.insert(notificacionesLog).values({
        usuarioId: encomienda.remitenteId,
        encomiendaId,
        canal: "correo",
        evento: "encomienda_finalizada_por_fallas",
      });
    }
  });

  return finalizarConBroadcast(encomiendaId);
}

export async function cancelar(actor: AuthUser, encomiendaId: number, motivo?: string) {
  requireEjecutivoOAdmin(actor);
  const encomienda = await obtenerEncomienda(encomiendaId);

  if (encomienda.estado === "entregada" || encomienda.estado === "finalizada") {
    throw Errors.invalidTransition(encomienda.estado, "finalizada");
  }

  await transicionar(encomiendaId, "finalizada", actor.id, motivo ?? "cancelacion_manual");
  return finalizarConBroadcast(encomiendaId);
}

export async function cambiarEstadoPago(actor: AuthUser, encomiendaId: number, estadoPago: EstadoPago) {
  requireEjecutivoOAdmin(actor);
  await obtenerEncomienda(encomiendaId);

  await db
    .update(encomiendas)
    .set({ estadoPago, updatedAt: new Date().toISOString() })
    .where(eq(encomiendas.id, encomiendaId));

  return finalizarConBroadcast(encomiendaId);
}

// Consulta PUBLICA (sin autenticacion). Solo campos explicitamente
// autorizados por el vault: numero_seguimiento, estado, historial de
// estados. NUNCA agregar columnas nuevas aca sin revisar
// base-datos/esquema.sql (comentarios "PRIVADO").
export async function consultaPublica(numeroSeguimiento: string) {
  const [encomienda] = await db
    .select({ id: encomiendas.id, numeroSeguimiento: encomiendas.numeroSeguimiento, estado: encomiendas.estado })
    .from(encomiendas)
    .where(eq(encomiendas.numeroSeguimiento, numeroSeguimiento))
    .limit(1);

  if (!encomienda) throw Errors.notFound("Encomienda");

  const historial = await db
    .select({ estado: encomiendaEstadoHistorial.estado, fecha: encomiendaEstadoHistorial.createdAt })
    .from(encomiendaEstadoHistorial)
    .where(eq(encomiendaEstadoHistorial.encomiendaId, encomienda.id))
    .orderBy(encomiendaEstadoHistorial.createdAt);

  return {
    numeroSeguimiento: encomienda.numeroSeguimiento,
    estado: encomienda.estado,
    historial,
  };
}
