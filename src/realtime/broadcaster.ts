import type { WebSocket } from "ws";
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
