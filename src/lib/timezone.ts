// Zona horaria unica del negocio: toda nocion de "hoy" (resumenes diarios,
// reportes) se calcula aca, nunca en UTC ni en la zona del servidor/cliente.
export const TIMEZONE = "America/Santiago";

export interface RangoDia {
  inicio: Date;
  fin: Date;
}

interface PartesFecha {
  anio: number;
  mes: number;
  dia: number;
  hora: number;
  minuto: number;
  segundo: number;
}

function obtenerPartesEnZona(fecha: Date, zona: string): PartesFecha {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: zona,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const valores = Object.fromEntries(dtf.formatToParts(fecha).map((p) => [p.type, p.value]));
  return {
    anio: Number(valores.year),
    mes: Number(valores.month),
    dia: Number(valores.day),
    hora: Number(valores.hour),
    minuto: Number(valores.minute),
    segundo: Number(valores.second),
  };
}

/**
 * Instante UTC de la medianoche de "hoy" (inicio, inclusivo) y de "manana"
 * (fin, exclusivo) en `zona`, calculado a partir de `referencia`.
 *
 * No asume un offset fijo (ej. "-04:00"): usa Intl.DateTimeFormat para leer
 * como se ve `referencia` en `zona` y de ahi deriva el offset real vigente
 * en ese instante especifico. Soporta cualquier regla de horario de verano
 * que el motor ICU de Node tenga cargada, pasada o futura, sin depender de
 * una libreria de fechas.
 */
export function rangoDelDia(zona: string = TIMEZONE, referencia: Date = new Date()): RangoDia {
  const partes = obtenerPartesEnZona(referencia, zona);

  // "Como si" la hora local fuera UTC nos da, por diferencia con el
  // instante real, el offset de la zona vigente en ese momento.
  const comoUTC = Date.UTC(partes.anio, partes.mes - 1, partes.dia, partes.hora, partes.minuto, partes.segundo);
  const offsetMs = comoUTC - referencia.getTime();

  const medianocheHoyComoUTC = Date.UTC(partes.anio, partes.mes - 1, partes.dia, 0, 0, 0);
  const inicio = new Date(medianocheHoyComoUTC - offsetMs);
  const fin = new Date(inicio.getTime() + 24 * 60 * 60 * 1000);

  return { inicio, fin };
}

/** Fecha calendario (YYYY-MM-DD) de `referencia` vista en `zona`. */
export function fechaEnZona(zona: string = TIMEZONE, referencia: Date = new Date()): string {
  const { anio, mes, dia } = obtenerPartesEnZona(referencia, zona);
  return `${anio}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}
