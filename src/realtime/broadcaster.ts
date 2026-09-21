import { and, eq, inArray } from "drizzle-orm";
import type { WebSocket } from "ws";
import { db } from "../db/index.js";
import { usuarios } from "../db/schema.js";
import type { AuthUser } from "../plugins/auth.js";

// Registro en memoria de conexiones WS activas. Suficiente para un solo
// proceso backend (MVP); si en el futuro se escala horizontalmente, esto
// necesita moverse a un pub/sub externo (Redis, etc.).
interface Connection {
  socket: WebSocket;
  user: AuthUser;
}

const connections = new Set<Connection>();

export function registerConnection(socket: WebSocket, user: AuthUser) {
  const conn: Connection = { socket, user };
  connections.add(conn);
  socket.once("close", () => connections.delete(conn));
  return conn;
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
