import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  crearTurnoBodySchema,
  actualizarTurnoBodySchema,
  listarTurnosQuerySchema,
} from "./turnos.schemas.js";
import { crearTurno, obtenerTurno, listarTurnos, actualizarTurno, eliminarTurno } from "./turnos.service.js";

const idParamSchema = z.object({ id: z.coerce.number().int().positive() });

export async function turnosRoutes(app: FastifyInstance) {
  app.post(
    "/turnos",
    { preHandler: [app.authenticate, app.requireRole("administrador")] },
    async (request, reply) => {
      const body = crearTurnoBodySchema.parse(request.body);
      const turno = await crearTurno(request.user!, body);
      return reply.status(201).send({ turno });
    }
  );

  app.get("/turnos", { preHandler: app.authenticate }, async (request, reply) => {
    const query = listarTurnosQuerySchema.parse(request.query);
    const lista = await listarTurnos(request.user!, query);
    return reply.send({ turnos: lista });
  });

  app.get("/turnos/:id", { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    const turno = await obtenerTurno(id);
    return reply.send({ turno });
  });

  app.patch(
    "/turnos/:id",
    { preHandler: [app.authenticate, app.requireRole("administrador")] },
    async (request, reply) => {
      const { id } = idParamSchema.parse(request.params);
      const body = actualizarTurnoBodySchema.parse(request.body);
      const turno = await actualizarTurno(request.user!, id, body);
      return reply.send({ turno });
    }
  );

  app.delete(
    "/turnos/:id",
    { preHandler: [app.authenticate, app.requireRole("administrador")] },
    async (request, reply) => {
      const { id } = idParamSchema.parse(request.params);
      await eliminarTurno(request.user!, id);
      return reply.status(204).send();
    }
  );
}
