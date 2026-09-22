// Deshace el ruido dejado por simular-posiciones.ts en el mapa real de
// /seguimiento: borra las posiciones de los 5 conductores de prueba y los
// desactiva (activo=false, mismo patron soft-delete que sucursales). Los 5
// RUTs son 100% sinteticos (ver simulacion-conductores.data.ts) y exclusivos
// de este flujo, asi que siempre es seguro desactivarlos a los 5 sin
// distincion.
//
// Uso: bun run limpiar:simulacion
import { inArray } from "drizzle-orm";
import { db, pool } from "../src/db/index.js";
import { posicionesConductor, usuarios } from "../src/db/schema.js";
import { SIM_CONDUCTORES } from "./simulacion-conductores.data.js";

async function main() {
  const ids = await db
    .select({ id: usuarios.id, rut: usuarios.rut })
    .from(usuarios)
    .where(
      inArray(
        usuarios.rut,
        SIM_CONDUCTORES.map((c) => c.rut)
      )
    );

  if (ids.length === 0) {
    console.log("No hay conductores de simulacion en DB, nada que limpiar.");
    await pool.end();
    return;
  }

  const idsNumericos = ids.map((u) => u.id);
  const borradas = await db
    .delete(posicionesConductor)
    .where(inArray(posicionesConductor.conductorId, idsNumericos))
    .returning({ id: posicionesConductor.id });
  console.log(`Posiciones borradas: ${borradas.length}`);

  await db.update(usuarios).set({ activo: false }).where(inArray(usuarios.id, idsNumericos));
  console.log(`Desactivados: ${ids.map((u) => u.rut).join(", ")}`);

  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  await pool.end();
  process.exit(1);
});
