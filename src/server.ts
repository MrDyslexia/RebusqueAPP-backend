import Fastify from "fastify";
import websocket from "@fastify/websocket";
import cors from "@fastify/cors";
import { ZodError } from "zod";
import { env } from "./config/env.js";
import { healthRoutes } from "./routes/health.js";
import authPlugin from "./plugins/auth.js";
import { authRoutes } from "./modules/auth/auth.routes.js";
import { usuariosRoutes } from "./modules/usuarios/usuarios.routes.js";
import { encomiendasRoutes } from "./modules/encomiendas/encomiendas.routes.js";
import { sucursalesRoutes } from "./modules/sucursales/sucursales.routes.js";
import { turnosRoutes } from "./modules/turnos/turnos.routes.js";
import { AppError } from "./lib/errors.js";
import { resolveUserFromToken } from "./plugins/auth.js";
import { registerConnection } from "./realtime/broadcaster.js";

const app = Fastify({
  logger: true,
});

app.setErrorHandler((error, _request, reply) => {
  if (error instanceof ZodError) {
    return reply.status(400).send({
      error: "validation_error",
      message: "Datos de entrada invalidos",
      issues: error.flatten().fieldErrors,
    });
  }

  if (error instanceof AppError) {
    return reply.status(error.statusCode).send({
      error: error.code,
      message: error.message,
    });
  }

  app.log.error(error);
  return reply.status(500).send({
    error: "internal_error",
    message: "Error interno del servidor",
  });
});

await app.register(cors, {
  origin: env.CORS_ALLOWED_ORIGINS,
  credentials: true,
  methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
});
await app.register(websocket);
await app.register(authPlugin);
await app.register(healthRoutes);
await app.register(authRoutes);
await app.register(usuariosRoutes);
await app.register(encomiendasRoutes);
await app.register(sucursalesRoutes);
await app.register(turnosRoutes);

// Sincronizacion en tiempo real (backend.md): mantiene sincronizados todos
// los clientes conectados ante cambios de estado/asignacion de encomiendas.
// Autenticacion via query string (?token=...) porque el handshake de
// WebSocket del navegador no permite mandar headers custom.
app.get(
  "/ws",
  {
    websocket: true,
    preValidation: async (request, reply) => {
      const token = (request.query as { token?: string } | undefined)?.token;
      if (!token) {
        return reply.code(401).send({ error: "unauthorized", message: "token requerido en ?token=" });
      }
      const user = await resolveUserFromToken(token);
      if (!user) {
        return reply.code(401).send({ error: "unauthorized", message: "token invalido o expirado" });
      }
      request.user = user;
    },
  },
  (socket, request) => {
    registerConnection(socket, request.user!);
    socket.send(JSON.stringify({ type: "conectado", data: { userId: request.user!.id, rol: request.user!.rol } }));
  }
);

try {
  await app.listen({ port: env.PORT, host: env.HOST });
  app.log.info(`RebusqueApp backend escuchando en ${env.HOST}:${env.PORT}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
