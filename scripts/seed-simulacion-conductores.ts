// Crea (o resetea la contraseña de) 5 conductores de prueba para simular
// seguimiento en tiempo real sin depender de app-expo. Idempotente: si el
// RUT ya existe lo reactiva y le resetea la contraseña a la conocida; si no
// existe lo crea. Pensado SOLO para entorno de desarrollo (mismo espiritu
// que seed-admin.ts: acceso directo a DB, no expuesto como endpoint HTTP).
//
// Uso (desde backend/, host): bun run seed:simulacion
import { eq } from "drizzle-orm";
import { db, pool } from "../src/db/index.js";
import { usuarios } from "../src/db/schema.js";
import { hashPassword } from "../src/lib/security.js";
import { SIM_CONDUCTORES, SIM_PASSWORD } from "./simulacion-conductores.data.js";

async function main() {
  const passwordHash = await hashPassword(SIM_PASSWORD);

  for (const conductor of SIM_CONDUCTORES) {
    const [existente] = await db
      .select({ id: usuarios.id })
      .from(usuarios)
      .where(eq(usuarios.rut, conductor.rut))
      .limit(1);

    if (existente) {
      await db
        .update(usuarios)
        .set({ passwordHash, activo: true, updatedAt: new Date().toISOString() })
        .where(eq(usuarios.id, existente.id));
      console.log(`Reseteado: ${conductor.rut} (id ${existente.id})`);
      continue;
    }

    const [nuevo] = await db
      .insert(usuarios)
      .values({
        rut: conductor.rut,
        email: `sim.${conductor.body}@elrebusque.test`,
        passwordHash,
        rol: "conductor",
        primerNombre: conductor.nombre,
        primerApellido: conductor.apellido,
      })
      .returning({ id: usuarios.id });
    console.log(`Creado: ${conductor.rut} (id ${nuevo!.id})`);
  }

  console.log(`\nListo. Password para los 5: "${SIM_PASSWORD}"`);
  await pool.end();
}

// Guard de import.meta.main (Bun): permite que simular-posiciones.ts
// importe SIM_CONDUCTORES/SIM_PASSWORD de este mismo archivo sin disparar
// el seed de nuevo ni intentar abrir una conexion a DB que ese script no
// necesita (solo habla HTTP con el backend real).
if (import.meta.main) {
  main().catch(async (err) => {
    console.error(err);
    await pool.end();
    process.exit(1);
  });
}
