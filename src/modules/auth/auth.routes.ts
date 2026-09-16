import type { FastifyInstance } from "fastify";
import { loginBodySchema, cambiarEmailPropioBodySchema } from "./auth.schemas.js";
import { login, logout, cambiarEmailPropio } from "./auth.service.js";

export async function authRoutes(app: FastifyInstance) {
  app.post("/auth/login", async (request, reply) => {
    const body = loginBodySchema.parse(request.body);
    const result = await login(body);
    return reply.send(result);
  });

  app.post(
    "/auth/logout",
    { preHandler: app.authenticate },
    async (request, reply) => {
      await logout(request.user!.sesionId);
      return reply.status(204).send();
    }
  );

  app.get("/auth/me", { preHandler: app.authenticate }, async (request, reply) => {
    return reply.send({ user: request.user });
  });

  app.patch("/auth/email", { preHandler: app.authenticate }, async (request, reply) => {
    const body = cambiarEmailPropioBodySchema.parse(request.body);
    const result = await cambiarEmailPropio(request.user!, body.currentPassword, body.newEmail);
    return reply.send(result);
  });
}
