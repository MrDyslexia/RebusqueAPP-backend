import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  crearEncomiendaBodySchema,
  asignarConductorBodySchema,
  decidirPostRetiroBodySchema,
  entregarBodySchema,
  reportarFallidaBodySchema,
  cancelarBodySchema,
  cambiarPagoBodySchema,
  listarEncomiendasQuerySchema,
} from "./encomiendas.schemas.js";
import {
  crearEncomienda,
  obtenerEncomienda,
  obtenerEncomiendaPorQr,
  listarEncomiendas,
  asignarConductor,
  recoger,
  decidirPostRetiro,
  cargar,
  entregar,
  reportarFallida,
  cancelar,
  cambiarEstadoPago,
  consultaPublica,
  obtenerFotoEntregaBuffer,
  obtenerFotoEntregaFallidaBuffer,
} from "./encomiendas.service.js";

const idParamSchema = z.object({ id: z.coerce.number().int().positive() });

export async function encomiendasRoutes(app: FastifyInstance) {
  // --- Rutas protegidas (ejecutivo/administrador/conductor segun accion) ---

  app.post("/encomiendas", { preHandler: app.authenticate }, async (request, reply) => {
    const body = crearEncomiendaBodySchema.parse(request.body);
    const encomienda = await crearEncomienda(request.user!, body);
    return reply.status(201).send({ encomienda });
  });

  app.get("/encomiendas", { preHandler: app.authenticate }, async (request, reply) => {
    const query = listarEncomiendasQuerySchema.parse(request.query);
    const lista = await listarEncomiendas(request.user!, query.estado);
    return reply.send({ encomiendas: lista });
  });

  app.get("/encomiendas/qr/:codigoQr", { preHandler: app.authenticate }, async (request, reply) => {
    const { codigoQr } = z.object({ codigoQr: z.string().min(1).max(128) }).parse(request.params);
    const encomienda = await obtenerEncomiendaPorQr(request.user!, codigoQr);
    return reply.send({ encomienda });
  });

  app.get("/encomiendas/:id", { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    const encomienda = await obtenerEncomienda(id, request.user!);
    return reply.send({ encomienda });
  });

  // Binario real de la foto de entrega (bytea). El detalle/listado solo
  // exponen `tieneFotoEntrega: boolean`, nunca el buffer inline.
  app.get(
    "/encomiendas/:id/foto-entrega",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { id } = idParamSchema.parse(request.params);
      const buffer = await obtenerFotoEntregaBuffer(id, request.user!);
      if (!buffer) return reply.status(404).send({ error: "not_found", message: "Sin foto de entrega" });
      return reply.type("image/jpeg").send(buffer);
    }
  );

  app.get(
    "/encomiendas/:id/foto-entrega-fallida",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { id } = idParamSchema.parse(request.params);
      const buffer = await obtenerFotoEntregaFallidaBuffer(id, request.user!);
      if (!buffer) return reply.status(404).send({ error: "not_found", message: "Sin foto de entrega fallida" });
      return reply.type("image/jpeg").send(buffer);
    }
  );

  app.post(
    "/encomiendas/:id/asignar",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { id } = idParamSchema.parse(request.params);
      const body = asignarConductorBodySchema.parse(request.body);
      const encomienda = await asignarConductor(request.user!, id, body.conductorId);
      return reply.send({ encomienda });
    }
  );

  app.post("/encomiendas/:id/recoger", { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    const encomienda = await recoger(request.user!, id);
    return reply.send({ encomienda });
  });

  app.post(
    "/encomiendas/:id/decidir-post-retiro",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { id } = idParamSchema.parse(request.params);
      const body = decidirPostRetiroBodySchema.parse(request.body);
      const encomienda = await decidirPostRetiro(request.user!, id, body.decision);
      return reply.send({ encomienda });
    }
  );

  app.post("/encomiendas/:id/cargar", { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    const encomienda = await cargar(request.user!, id);
    return reply.send({ encomienda });
  });

  app.post("/encomiendas/:id/entregar", { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    const body = entregarBodySchema.parse(request.body ?? {});
    const encomienda = await entregar(request.user!, id, body.fotoEntregaBase64);
    return reply.send({ encomienda });
  });

  app.post(
    "/encomiendas/:id/reportar-fallida",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { id } = idParamSchema.parse(request.params);
      const body = reportarFallidaBodySchema.parse(request.body);
      const encomienda = await reportarFallida(request.user!, id, body.motivo, body.fotoReporteBase64);
      return reply.send({ encomienda });
    }
  );

  app.post("/encomiendas/:id/cancelar", { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    const body = cancelarBodySchema.parse(request.body ?? {});
    const encomienda = await cancelar(request.user!, id, body.motivo);
    return reply.send({ encomienda });
  });

  app.patch("/encomiendas/:id/pago", { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    const body = cambiarPagoBodySchema.parse(request.body);
    const encomienda = await cambiarEstadoPago(request.user!, id, body.estadoPago);
    return reply.send({ encomienda });
  });

  // --- Ruta PUBLICA, sin autenticacion. Consumida por la landing page ---
  // --- existente (fuera de RebusqueApp), ver backend.md en el vault.    ---
  app.get("/encomiendas/seguimiento/:numeroSeguimiento", async (request, reply) => {
    const { numeroSeguimiento } = z
      .object({ numeroSeguimiento: z.string().min(1) })
      .parse(request.params);
    const resultado = await consultaPublica(numeroSeguimiento);
    return reply.send(resultado);
  });
}
