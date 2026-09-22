// Datos compartidos entre seed-simulacion-conductores.ts (crea/resetea los
// usuarios en DB) y simular-posiciones.ts (los loguea via HTTP y les hace
// mandar posiciones). Sin dependencias de DB/env a proposito: este archivo
// tiene que poder importarse desde el script HTTP-only sin arrastrar un
// Pool de Postgres que ese script no necesita.
import { computeDv } from "../src/lib/rut.js";

export const SIM_PASSWORD = "TestSim123";

function rutConDv(body: string): string {
  return `${body}-${computeDv(body)}`;
}

// 100% sinteticos, ninguno colisiona con RUTs reales de conductores de dev
// (30111222-K, 30222333-5 -- ver backend.md, "Password de conductor de
// prueba pisada por simulador"). Reusar esos dos como fixture invalidaba su
// password de dev cada vez que corria seed:simulacion, rompiendo el login
// manual de quien estuviera probando la app. Este script nunca debe tocar
// una cuenta que no haya creado el mismo.
export const SIM_CONDUCTORES = [
  { body: "30666777", nombre: "Simulado", apellido: "Uno" },
  { body: "30777888", nombre: "Simulado", apellido: "Dos" },
  { body: "30333444", nombre: "Simulado", apellido: "Tres" },
  { body: "30444555", nombre: "Simulado", apellido: "Cuatro" },
  { body: "30555666", nombre: "Simulado", apellido: "Cinco" },
].map((c) => ({ ...c, rut: rutConDv(c.body) }));
