// Bootstrap del primer administrador. No expuesto como endpoint HTTP a
// proposito (crear un admin sin autenticacion previa seria un agujero de
// seguridad). Correr una sola vez, a mano, en el contenedor o localmente
// apuntando a la DB correcta.
//
// Uso:
//   SEED_ADMIN_RUT="11111111-1" SEED_ADMIN_EMAIL="admin@elrebusque.cl" \
//   SEED_ADMIN_PASSWORD="algo-seguro" bun run scripts/seed-admin.ts
import { eq } from "drizzle-orm";
import { db, pool } from "../src/db/index.js";
import { usuarios } from "../src/db/schema.js";
import { normalizeRut } from "../src/lib/rut.js";
import { hashPassword } from "../src/lib/security.js";

async function main() {
  const rutInput = process.env.SEED_ADMIN_RUT;
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;

  if (!rutInput || !email || !password) {
    console.error(
      "Faltan variables: SEED_ADMIN_RUT, SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD"
    );
    process.exit(1);
  }

  const rut = normalizeRut(rutInput);

  const existente = await db
    .select({ id: usuarios.id })
    .from(usuarios)
    .where(eq(usuarios.rol, "administrador"))
    .limit(1);

  if (existente.length > 0) {
    console.log("Ya existe al menos un administrador. No se crea ninguno nuevo.");
    await pool.end();
    return;
  }

  const passwordHash = await hashPassword(password);

  const [admin] = await db
    .insert(usuarios)
    .values({ rut, email, passwordHash, rol: "administrador" })
    .returning({ id: usuarios.id, rut: usuarios.rut, email: usuarios.email });

  console.log("Administrador creado:", admin);
  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  await pool.end();
  process.exit(1);
});
