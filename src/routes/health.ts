import type { FastifyInstance } from "fastify";
import { checkDbConnection } from "../db/index.js";

export async function healthRoutes(app: FastifyInstance) {
  app.get("/health", async (_req, reply) => {
    const dbOk = await checkDbConnection();
    const status = dbOk ? 200 : 503;
    return reply.status(status).send({
      status: dbOk ? "ok" : "degraded",
      db: dbOk ? "connected" : "unreachable",
      timestamp: new Date().toISOString(),
    });
  });
}
