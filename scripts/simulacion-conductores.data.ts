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

export const SIM_CONDUCTORES = [
  { body: "30111222", nombre: "Simulado", apellido: "Uno" },
  { body: "30222333", nombre: "Simulado", apellido: "Dos" },
  { body: "30333444", nombre: "Simulado", apellido: "Tres" },
  { body: "30444555", nombre: "Simulado", apellido: "Cuatro" },
  { body: "30555666", nombre: "Simulado", apellido: "Cinco" },
].map((c) => ({ ...c, rut: rutConDv(c.body) }));
