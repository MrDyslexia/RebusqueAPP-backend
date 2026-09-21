// Deshace el ruido dejado por simular-posiciones.ts en el mapa real de
// /seguimiento: borra las posiciones de los 5 conductores de prueba y
// desactiva (activo=false, mismo patron soft-delete que sucursales) SOLO
// los que este mismo flujo de simulacion creo de cero -- los que ya
// existian antes (ver seed-simulacion-conductores.ts, log "Reseteado:")
// se dejan activos porque pueden estar en uso por otros datos de prueba
// (turnos, encomiendas asignadas); a esos dos unicamente se les toco la
// password, no el estado.
//
// Uso: bun run limpiar:simulacion
import { eq, inArray } from "drizzle-orm";
import { db, pool } from "../src/db/index.js";
import { posicionesConductor, usuarios } from "../src/db/schema.js";
import { SIM_CONDUCTORES } from "./simulacion-conductores.data.js";

// Coinciden con los "Creado:" del ultimo run de seed-simulacion-conductores.ts
// (los dos primeros, 30111222-K/30222333-5, ya existian antes de este flujo).
const RUTS_CREADOS_POR_SIMULACION = SIM_CONDUCTORES.slice(2).map((c) => c.rut);

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

  const idsADesactivar = ids
    .filter((u) => RUTS_CREADOS_POR_SIMULACION.includes(u.rut))
    .map((u) => u.id);

  if (idsADesactivar.length > 0) {
    await db.update(usuarios).set({ activo: false }).where(inArray(usuarios.id, idsADesactivar));
    console.log(`Desactivados (creados por la simulacion): ${idsADesactivar.join(", ")}`);
  }

  const dejados = ids.filter((u) => !RUTS_CREADOS_POR_SIMULACION.includes(u.rut));
  if (dejados.length > 0) {
    console.log(
      `Sin tocar estado (ya existian antes, solo tenian password reseteada): ${dejados
        .map((u) => u.rut)
        .join(", ")}`
    );
  }

  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  await pool.end();
  process.exit(1);
});
