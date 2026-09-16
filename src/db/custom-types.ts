import { customType } from "drizzle-orm/pg-core";

// drizzle-kit pull (v0.31) todavia no mapea `bytea` de Postgres a un tipo
// nativo de drizzle-orm/pg-core (genera un placeholder `unknown(...)` que
// rompe en runtime). Este archivo NO se regenera con `bun run db:pull`;
// el script scripts/fix-bytea.ts parchea schema.ts para usar esto despues
// de cada pull. Ver README.md.
export const bytea = customType<{ data: Buffer }>({
  dataType() {
    return "bytea";
  },
});
