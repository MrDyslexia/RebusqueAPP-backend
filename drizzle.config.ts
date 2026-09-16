import { defineConfig } from "drizzle-kit";
import "dotenv/config";

export default defineConfig({
  dialect: "postgresql",
  // Database-first: el esquema real vive en base-datos/init/001_esquema.sql.
  // `bun run db:pull` sobreescribe src/db/schema.ts y src/db/relations.ts
  // con lo que exista realmente en Postgres. No editar esos dos a mano.
  out: "./src/db",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
