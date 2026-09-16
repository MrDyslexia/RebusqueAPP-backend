import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(5002),
  HOST: z.string().default("0.0.0.0"),
  DATABASE_URL: z.string().url(),
  SESSION_TTL_HOURS: z.coerce.number().int().positive().default(12),
  // Origenes permitidos para CORS (separados por coma). El backend es
  // consumido directamente desde el navegador (web-nextjs, landing publica).
  CORS_ALLOWED_ORIGINS: z
    .string()
    .default(
      "http://localhost:3006,http://127.0.0.1:3006,https://platform.elrebusque.cl,https://elrebusque.cl,https://www.elrebusque.cl"
    )
    .transform((v) => v.split(",").map((o) => o.trim()).filter(Boolean)),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error("Variables de entorno invalidas:");
    console.error(parsed.error.flatten().fieldErrors);
    process.exit(1);
  }
  return parsed.data;
}

export const env = loadEnv();
