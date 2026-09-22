import { and, eq, inArray } from "drizzle-orm";
import type { WebSocket } from "ws";
import { db } from "../db/index.js";
import { usuarios } from "../db/schema.js";
import type { AuthUser } from "../plugins/auth.js";

// Registro en memoria de conexiones WS activas. Suficiente para un solo
// proceso backend (MVP); si en el futuro se escala horizontalmente, esto
// necesita moverse a un pub/sub externo (Redis, etc.) -- mismo caveat ya
// aceptado para el rate-limit de posiciones y el job de purga.
interface Connection {
  socket: WebSocket;
  user: AuthUser;
  // Keepalive de transporte (ver iniciarKeepAlive): true si respondio el
  // ultimo ping. socket.OPEN por si solo no detecta una caida abrupta de
  // red o un proceso suspendido -- el socket queda "medio abierto" sin
  // disparar 'close'.
  isAlive: boolean;
}

const connections = new Set<Connection>();
// Presencia por usuario (no por socket): un mismo usuario puede tener mas
// de una conexion (ej. dos pestañas de administrador). "Conectado" es
// tener AL MENOS una, y el evento de presencia solo debe salir en la
// transicion 0->1 / 1->0, nunca por cada socket individual.
const connectionsByUser = new Map<number, Set<Connection>>();

export function registerConnection(socket: WebSocket, user: AuthUser) {
  const conn: Connection = { socket, user, isAlive: true };
  connections.add(conn);

  let deEsteUsuario = connectionsByUser.get(user.id);
  if (!deEsteUsuario) {
    deEsteUsuario = new Set();
    connectionsByUser.set(user.id, deEsteUsuario);
  }
  const eraCero = deEsteUsuario.size === 0;
  deEsteUsuario.add(conn);
  if (eraCero) broadcastConexionActualizada(user.id, true);

  socket.on("pong", () => {
    conn.isAlive = true;
  });

  socket.once("close", () => {
    connections.delete(conn);
    const restantes = connectionsByUser.get(user.id);
    if (!restantes) return;
    restantes.delete(conn);
    if (restantes.size === 0) {
      connectionsByUser.delete(user.id);
      broadcastConexionActualizada(user.id, false);
    }
  });

  return conn;
}

/**
 * "Sesion en tiempo real conectada" para un usuario: tiene el WS abierto en
 * ESTE proceso, no implica nada sobre GPS ni sobre que dispositivo fisico
 * es (ver usuarios.routes.ts, campo `realtimeConnected`).
 */
export function estaConectadoEnTiempoReal(usuarioId: number): boolean {
  return connectionsByUser.has(usuarioId);
}

// Keepalive de transporte (patron documentado por la libreria `ws`): cada
// KEEPALIVE_INTERVALO_MS se pinguea cada conexion viva; si no respondio el
// pong anterior (isAlive seguia en false desde el tick previo), se
// considera muerta y se fuerza el cierre. Deteccion en como maximo 2 ciclos
// (~60s con el intervalo por defecto) de una caida que socket.OPEN por si
// solo no ve -- red cortada abruptamente, proceso del cliente suspendido,
// etc. El 'close' que dispara terminate() reusa la misma limpieza de
// registerConnection, asi que la transicion 1->0 sale igual.
const KEEPALIVE_INTERVALO_MS = 30_000;

export function iniciarKeepAlive() {
  setInterval(() => {
    for (const conn of connections) {
      if (!conn.isAlive) {
        conn.socket.terminate();
        continue;
      }
      conn.isAlive = false;
      conn.socket.ping();
    }
  }, KEEPALIVE_INTERVALO_MS);
}

function broadcastConexionActualizada(usuarioId: number, conectado: boolean) {
  // A diferencia de posicion_actualizada, esto NO respeta
  // acceso_seguimiento_bloqueado: ese permiso protege coordenadas GPS y el
  // mapa de /seguimiento; la presencia WS es informacion operativa del
  // panel de Usuarios, un concern distinto.
  const payload = JSON.stringify({
    type: "realtime_conexion_actualizada",
    data: { usuarioId, conectado },
  });

  for (const conn of connections) {
    if (conn.socket.readyState !== conn.socket.OPEN) continue;
    if (conn.user.rol === "administrador" || conn.user.rol === "ejecutivo") {
      conn.socket.send(payload);
    }
  }
}

export interface EncomiendaBroadcastPayload {
  id: number;
  numeroSeguimiento: string;
  estado: string;
  conductorAsignadoId: number | null;
}

// Visibilidad identica a GET /encomiendas: administrador/ejecutivo ven todo,
// conductor solo las suyas. Cliente no tiene WS (no-MVP, ver backend.md).
function esVisiblePara(user: AuthUser, encomienda: EncomiendaBroadcastPayload): boolean {
  if (user.rol === "administrador" || user.rol === "ejecutivo") return true;
  if (user.rol === "conductor") return user.id === encomienda.conductorAsignadoId;
  return false;
}

export function broadcastEncomiendaActualizada(encomienda: EncomiendaBroadcastPayload) {
  const payload = JSON.stringify({
    type: "encomienda_actualizada",
    data: encomienda,
  });

  for (const conn of connections) {
    if (conn.socket.readyState !== conn.socket.OPEN) continue;
    if (esVisiblePara(conn.user, encomienda)) {
      conn.socket.send(payload);
    }
  }
}

export interface PosicionBroadcastPayload {
  conductorId: number;
  latitud: number;
  longitud: number;
  capturadoAt: string;
  // Identidad denormalizada para que el frontend pueda mostrar el tooltip
  // sin depender de tener ya cacheada esta posicion desde GET
  // /posiciones/ultimas (el primer evento de un conductor en la sesion no
  // tiene de donde mas sacarla).
  rut: string;
  primerNombre: string | null;
  primerApellido: string | null;
}

// Seguimiento en tiempo real (post-MVP): administrador siempre visible;
// ejecutivo solo si `acceso_seguimiento_bloqueado` es false. A diferencia de
// `esVisiblePara` (arriba, chequea solo campos estaticos del payload), este
// caso depende de una columna MUTABLE de `usuarios` -- por eso se consulta
// fresca en cada broadcast en vez de confiar en el rol capturado al
// conectar el socket: si el administrador bloquea a un ejecutivo con la
// sesion ya abierta, deja de recibir el siguiente evento sin esperar a que
// reconecte. Costo aceptado: 1 query extra por broadcast de posicion (no
// por cada socket), volumen bajo (cada 5s por conductor activo).
export async function broadcastPosicionActualizada(posicion: PosicionBroadcastPayload) {
  const destinatarios = [...connections].filter(
    (conn) =>
      conn.socket.readyState === conn.socket.OPEN &&
      (conn.user.rol === "administrador" || conn.user.rol === "ejecutivo")
  );
  if (destinatarios.length === 0) return;

  const ejecutivoIds = destinatarios.filter((c) => c.user.rol === "ejecutivo").map((c) => c.user.id);
  const bloqueados = new Set<number>();
  if (ejecutivoIds.length > 0) {
    const filas = await db
      .select({ id: usuarios.id })
      .from(usuarios)
      .where(and(inArray(usuarios.id, ejecutivoIds), eq(usuarios.accesoSeguimientoBloqueado, true)));
    for (const fila of filas) bloqueados.add(fila.id);
  }

  const payload = JSON.stringify({ type: "posicion_actualizada", data: posicion });
  for (const conn of destinatarios) {
    if (conn.user.rol === "ejecutivo" && bloqueados.has(conn.user.id)) continue;
    conn.socket.send(payload);
  }
}
