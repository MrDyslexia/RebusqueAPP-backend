import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  crearSucursalBodySchema,
  actualizarSucursalBodySchema,
  listarSucursalesQuerySchema,
} from "./sucursales.schemas.js";
import {
  crearSucursal,
  listarSucursales,
  obtenerSucursal,
  actualizarSucursal,
} from "./sucursales.service.js";

const idParamSchema = z.object({ id: z.coerce.number().int().positive() });

export async function sucursalesRoutes(app: FastifyInstance) {
  app.post(
    "/sucursales",
    { preHandler: [app.authenticate, app.requireRole("administrador")] },
    async (request, reply) => {
      const body = crearSucursalBodySchema.parse(request.body);
      const sucursal = await crearSucursal(request.user!, body.nombre, body.direccion);
      return reply.status(201).send({ sucursal });
    }
  );

  // Lectura: cualquier usuario autenticado (ejecutivo la necesita para
  // registrar encomiendas, conductor para ver contexto de sus turnos).
  app.get("/sucursales", { preHandler: app.authenticate }, async (request, reply) => {
    const query = listarSucursalesQuerySchema.parse(request.query);
    const lista = await listarSucursales(query.activa);
    return reply.send({ sucursales: lista });
  });

  app.get("/sucursales/:id", { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    const sucursal = await obtenerSucursal(id);
    return reply.send({ sucursal });
  });

  app.patch(
    "/sucursales/:id",
    { preHandler: [app.authenticate, app.requireRole("administrador")] },
    async (request, reply) => {
      const { id } = idParamSchema.parse(request.params);
      const body = actualizarSucursalBodySchema.parse(request.body);
      const sucursal = await actualizarSucursal(request.user!, id, body);
      return reply.send({ sucursal });
    }
  );
}
