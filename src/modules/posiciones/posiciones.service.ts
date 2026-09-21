import { and, desc, eq, lt } from "drizzle-orm";
import { db } from "../../db/index.js";
import { posicionesConductor, turnos, usuarios } from "../../db/schema.js";
import { Errors } from "../../lib/errors.js";
import { fechaEnZona, horaEnZona } from "../../lib/timezone.js";
import type { AuthUser } from "../../plugins/auth.js";
import { broadcastPosicionActualizada } from "../../realtime/broadcaster.js";
import type { RegistrarPosicionBody } from "./posiciones.schemas.js";

// Cadencia esperada del cliente: 1 posicion/segundo (ver Coordinacion.md
// DEP-002 y backend.md). Guardarraiz servidor: rechaza 429 si llega antes de
// este margen desde la ULTIMA posicion ACEPTADA de ese conductor -- 900ms en
// vez de 1000ms exactos para tolerar jitter de reloj de un cliente bien
// comportado, sin abrir la puerta a un cliente que mande mucho mas seguido
// (bug o reintento agresivo) desperdiciando el fanout de broadcast hacia
// todos los administrador/ejecutivo conectados. En memoria del proceso
// (no persiste ni se comparte entre replicas del backend, igual que el
// registro de conexiones WS en realtime/broadcaster.ts): si el backend
// llegara a correr en mas de un proceso, cada uno guarda su propio cache y
// en el peor caso dos requests casi simultaneos a procesos distintos pasan
// el guardarrail -- degradacion aceptable, no una condicion de carrera que
// corrompa datos (el INSERT es siempre valido, solo se relaja el limite).
const ULTIMA_POSICION_ACEPTADA_MS = new Map<number, number>();
const INTERVALO_MINIMO_MS = 900;

// Retencion de datos: 14 dias. Sin este job `posiciones_conductor` crece sin
// limite -- no hay ningun otro mecanismo de borrado en el schema.
const RETENCION_POSICIONES_DIAS = 14;

/**
 * Resuelve el turno "activo ahora" del conductor (fecha = hoy en
 * America/Santiago, hora actual dentro de [hora_inicio, hora_fin)). No
 * confia en el cliente para esto -- igual criterio que el resto del backend
 * (ej. resumen-diario), server-side siempre.
 *
 * Devuelve null si el conductor no tiene turno activo en este momento; la
 * posicion igual se guarda (turno_id es nullable), solo queda sin asociar.
 */
async function resolverTurnoActivo(conductorId: number): Promise<number | null> {
  const hoy = fechaEnZona();
  const horaActual = horaEnZona();

  const turnosDeHoy = await db
    .select({ id: turnos.id, horaInicio: turnos.horaInicio, horaFin: turnos.horaFin })
    .from(turnos)
    .where(and(eq(turnos.conductorId, conductorId), eq(turnos.fecha, hoy)));

  const activo = turnosDeHoy.find((t) => t.horaInicio <= horaActual && horaActual < t.horaFin);
  return activo?.id ?? null;
}

export async function registrarPosicion(actor: AuthUser, input: RegistrarPosicionBody) {
  // La ruta ya exige requireRole("conductor"), este check es defensa en
  // profundidad si el service se llega a invocar desde otro lado.
  if (actor.rol !== "conductor") {
    throw Errors.forbidden("Solo el conductor autenticado puede enviar su posicion");
  }

  const ahora = Date.now();
  const ultima = ULTIMA_POSICION_ACEPTADA_MS.get(actor.id);
  if (ultima !== undefined && ahora - ultima < INTERVALO_MINIMO_MS) {
    throw Errors.posicionDemasiadoFrecuente();
  }

  const turnoId = await resolverTurnoActivo(actor.id);

  const [fila] = await db
    .insert(posicionesConductor)
    .values({
      conductorId: actor.id,
      turnoId,
      latitud: input.latitud.toFixed(6),
      longitud: input.longitud.toFixed(6),
    })
    .returning();

  ULTIMA_POSICION_ACEPTADA_MS.set(actor.id, ahora);

  await broadcastPosicionActualizada({
    conductorId: actor.id,
    latitud: input.latitud,
    longitud: input.longitud,
    capturadoAt: fila!.capturadoAt,
    rut: actor.rut,
    primerNombre: actor.primerNombre,
    primerApellido: actor.primerApellido,
  });

  return fila!;
}

/**
 * Ultima posicion conocida por conductor (para pintar el mapa al cargar; el
 * WS solo entrega eventos DESPUES de conectarse, no historial).
 *
 * Visibilidad: administrador ve todas; ejecutivo ve todas SOLO si
 * `usuarios.acceso_seguimiento_bloqueado` es false para el propio ejecutivo
 * (lo controla el administrador, ver PATCH /usuarios/:id/acceso-seguimiento);
 * cualquier otro rol, 403 (la ruta ya lo exige, este check es redundante
 * a proposito).
 */
export async function listarUltimasPosiciones(actor: AuthUser) {
  if (actor.rol === "ejecutivo") {
    const [fila] = await db
      .select({ bloqueado: usuarios.accesoSeguimientoBloqueado })
      .from(usuarios)
      .where(eq(usuarios.id, actor.id))
      .limit(1);
    if (fila?.bloqueado) {
      throw Errors.forbidden("Acceso a seguimiento en tiempo real bloqueado por administrador");
    }
  } else if (actor.rol !== "administrador") {
    throw Errors.forbidden("Solo administrador o ejecutivo pueden ver el seguimiento en tiempo real");
  }

  return db
    .selectDistinctOn([posicionesConductor.conductorId], {
      conductorId: posicionesConductor.conductorId,
      latitud: posicionesConductor.latitud,
      longitud: posicionesConductor.longitud,
      capturadoAt: posicionesConductor.capturadoAt,
      rut: usuarios.rut,
      primerNombre: usuarios.primerNombre,
      primerApellido: usuarios.primerApellido,
    })
    .from(posicionesConductor)
    .innerJoin(usuarios, eq(posicionesConductor.conductorId, usuarios.id))
    .orderBy(posicionesConductor.conductorId, desc(posicionesConductor.capturadoAt));
}

/**
 * Borra posiciones con mas de `RETENCION_POSICIONES_DIAS` dias de
 * antiguedad. Pensada para correr periodicamente desde `server.ts` (in
 * process, sin infra externa) -- ver ahi el detalle de la programacion y la
 * nota sobre multiples replicas del backend.
 *
 * Devuelve la cantidad de filas borradas (para loguear en el caller).
 */
export async function purgarPosicionesAntiguas(): Promise<number> {
  const limite = new Date(Date.now() - RETENCION_POSICIONES_DIAS * 24 * 60 * 60 * 1000).toISOString();
  const eliminadas = await db
    .delete(posicionesConductor)
    .where(lt(posicionesConductor.capturadoAt, limite))
    .returning({ id: posicionesConductor.id });
  return eliminadas.length;
}
