import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  crearUsuarioBodySchema,
  forzarResetPasswordBodySchema,
  cambiarEmailUsuarioBodySchema,
  listarUsuariosQuerySchema,
  actualizarAccesoSeguimientoBodySchema,
} from "./usuarios.schemas.js";
import {
  crearUsuario,
  forzarResetPassword,
  cambiarEmailDeUsuario,
  listarUsuarios,
  listarEncomiendasDeCliente,
  actualizarAccesoSeguimiento,
} from "./usuarios.service.js";

const idParamSchema = z.object({ id: z.coerce.number().int().positive() });

export async function usuariosRoutes(app: FastifyInstance) {
  app.get(
    "/usuarios",
    { preHandler: [app.authenticate, app.requireRole("administrador", "ejecutivo")] },
    async (request, reply) => {
      const query = listarUsuariosQuerySchema.parse(request.query);
      const lista = await listarUsuarios(query.rol);
      return reply.send({ usuarios: lista });
    }
  );

  app.post(
    "/usuarios",
    { preHandler: [app.authenticate, app.requireRole("administrador", "ejecutivo")] },
    async (request, reply) => {
      const body = crearUsuarioBodySchema.parse(request.body);
      const usuario = await crearUsuario(request.user!, body);
      return reply.status(201).send({ usuario });
    }
  );

  app.get(
    "/usuarios/:id/encomiendas",
    { preHandler: [app.authenticate, app.requireRole("administrador", "ejecutivo")] },
    async (request, reply) => {
      const { id } = idParamSchema.parse(request.params);
      const encomiendas = await listarEncomiendasDeCliente(id);
      return reply.send({ encomiendas });
    }
  );

  app.post(
    "/usuarios/:id/forzar-reset-password",
    { preHandler: [app.authenticate, app.requireRole("administrador")] },
    async (request, reply) => {
      const { id } = idParamSchema.parse(request.params);
      const body = forzarResetPasswordBodySchema.parse(request.body);
      const result = await forzarResetPassword(request.user!, id, body.newPassword);
      return reply.send(result);
    }
  );

  app.patch(
    "/usuarios/:id/email",
    { preHandler: [app.authenticate, app.requireRole("administrador")] },
    async (request, reply) => {
      const { id } = idParamSchema.parse(request.params);
      const body = cambiarEmailUsuarioBodySchema.parse(request.body);
      const result = await cambiarEmailDeUsuario(request.user!, id, body.newEmail);
      return reply.send(result);
    }
  );

  // Bloquea/desbloquea el acceso de un ejecutivo al seguimiento en tiempo
  // real (GET /posiciones/ultimas + broadcast WS). Solo aplica a rol
  // ejecutivo, ver usuarios.service.ts.
  app.patch(
    "/usuarios/:id/acceso-seguimiento",
    { preHandler: [app.authenticate, app.requireRole("administrador")] },
    async (request, reply) => {
      const { id } = idParamSchema.parse(request.params);
      const body = actualizarAccesoSeguimientoBodySchema.parse(request.body);
      const result = await actualizarAccesoSeguimiento(request.user!, id, body.bloqueado);
      return reply.send(result);
    }
  );
}
