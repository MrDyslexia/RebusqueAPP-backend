import type { FastifyInstance } from "fastify";
import { registrarPosicionBodySchema } from "./posiciones.schemas.js";
import { listarUltimasPosiciones, registrarPosicion } from "./posiciones.service.js";

export async function posicionesRoutes(app: FastifyInstance) {
  // Conductor envia su posicion (cada 5s desde app-expo, ver Coordinacion.md
  // del vault). REST en vez de mensaje WS entrante: el WS de este backend es
  // solo broadcast saliente hoy, no procesa mensajes de cliente.
  app.post(
    "/posiciones",
    { preHandler: [app.authenticate, app.requireRole("conductor")] },
    async (request, reply) => {
      const body = registrarPosicionBodySchema.parse(request.body);
      const posicion = await registrarPosicion(request.user!, body);
      return reply.status(201).send({ posicion });
    }
  );

  // Ultima posicion conocida por conductor, para pintar el mapa al cargar.
  // administrador siempre; ejecutivo solo si no esta bloqueado (403 si lo
  // esta, ver posiciones.service.ts).
  app.get(
    "/posiciones/ultimas",
    { preHandler: [app.authenticate, app.requireRole("administrador", "ejecutivo")] },
    async (request, reply) => {
      const posiciones = await listarUltimasPosiciones(request.user!);
      return reply.send({ posiciones });
    }
  );
}
