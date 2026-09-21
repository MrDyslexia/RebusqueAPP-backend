// Simula 5 conductores moviendose en simultaneo para validar seguimiento en
// tiempo real (DEP-002) SIN depender de app-expo, que hoy no existe en el
// workspace. Habla HTTP real contra el backend (login + POST /posiciones),
// nunca toca la DB directo -- desde el punto de vista del backend es
// indistinguible de 5 celulares reales.
//
// Requisito previo (una sola vez, o cuando quieras resetear password):
//   bun run seed:simulacion
//
// Uso:
//   bun run simular:posiciones
//   SIM_DURACION_MIN=5 bun run simular:posiciones   # se corta solo a los 5 min
//   SIM_BASE_URL=https://m4.blocktype.cl bun run simular:posiciones
//
// Sin SIM_DURACION_MIN corre indefinido (loop de la ruta) hasta Ctrl+C --
// pensado para dejarlo andando mientras se mira /seguimiento en el navegador.
import { SIM_CONDUCTORES, SIM_PASSWORD } from "./simulacion-conductores.data.js";

const BASE_URL = process.env.SIM_BASE_URL ?? "http://127.0.0.1:5002";
const DURACION_MIN = Number(process.env.SIM_DURACION_MIN ?? 0); // 0 = infinito
const PASOS_POR_SEGMENTO = Number(process.env.SIM_PASOS_POR_SEGMENTO ?? 12);
const JITTER_METROS = Number(process.env.SIM_JITTER_METROS ?? 4);
const INTERVALO_MS = 1000; // misma cadencia esperada del contrato DEP-002

// Loop de waypoints alrededor de Providencia/Las Condes (Santiago). No hace
// falta que siga calles reales pixel-perfect -- alcanza con que sea un loop
// cerrado con tramos rectos para que la interpolacion + jitter se vea como
// un vehiculo circulando, no un punto saltando.
const RUTA: [number, number][] = [
  [-33.4172, -70.6152],
  [-33.4172, -70.6021],
  [-33.4127, -70.5967],
  [-33.4066, -70.5967],
  [-33.4021, -70.6021],
  [-33.4021, -70.6099],
  [-33.4066, -70.6152],
  [-33.4127, -70.6178],
];

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// Random walk acotado: da un jitter que se mueve suave entre ticks (no
// "teletransporta" el ruido) en vez de ruido blanco puro por tick.
class DerivaAcotada {
  private valor = 0;
  constructor(private readonly maxMetros: number, private readonly pasoMaxMetros: number) {}
  siguiente(): number {
    this.valor += (Math.random() - 0.5) * 2 * this.pasoMaxMetros;
    if (this.valor > this.maxMetros) this.valor = this.maxMetros;
    if (this.valor < -this.maxMetros) this.valor = -this.maxMetros;
    return this.valor;
  }
}

function metrosALatGrados(metros: number): number {
  return metros / 111_320;
}

function metrosALngGrados(metros: number, latRef: number): number {
  return metros / (111_320 * Math.cos((latRef * Math.PI) / 180));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function login(rut: string): Promise<string> {
  const res = await fetch(`${BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      rut,
      password: SIM_PASSWORD,
      // Estable entre corridas: evita que cada re-run dispare el flujo de
      // "dispositivo reemplazado" (notifica administradores, ver
      // auth.service.ts upsertDispositivo) por ruido de este script.
      deviceIdentifier: `sim-${rut}`,
    }),
  });
  if (!res.ok) {
    throw new Error(`login fallo para ${rut}: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { token: string };
  return data.token;
}

async function enviarPosicion(token: string, latitud: number, longitud: number): Promise<"ok" | "rate_limited"> {
  const res = await fetch(`${BASE_URL}/posiciones`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ latitud, longitud }),
  });
  if (res.status === 429) return "rate_limited";
  if (!res.ok) {
    throw new Error(`POST /posiciones fallo: ${res.status} ${await res.text()}`);
  }
  return "ok";
}

async function simularConductor(
  conductor: (typeof SIM_CONDUCTORES)[number],
  indiceInicialRuta: number,
  delayInicialMs: number,
  finGlobal: number
) {
  await sleep(delayInicialMs);

  const token = await login(conductor.rut);
  console.log(`[${conductor.rut}] ${conductor.nombre} ${conductor.apellido} — logueado, arrancando ruta`);

  const derivaLat = new DerivaAcotada(JITTER_METROS, JITTER_METROS / 3);
  const derivaLng = new DerivaAcotada(JITTER_METROS, JITTER_METROS / 3);

  let segmento = indiceInicialRuta;
  let tick = 0;

  while (finGlobal === 0 || Date.now() < finGlobal) {
    const [latA, lngA] = RUTA[segmento % RUTA.length]!;
    const [latB, lngB] = RUTA[(segmento + 1) % RUTA.length]!;

    for (let paso = 0; paso < PASOS_POR_SEGMENTO; paso++) {
      if (finGlobal !== 0 && Date.now() >= finGlobal) break;

      const t = paso / PASOS_POR_SEGMENTO;
      const latBase = lerp(latA, latB, t);
      const lngBase = lerp(lngA, lngB, t);
      const lat = latBase + metrosALatGrados(derivaLat.siguiente());
      const lng = lngBase + metrosALngGrados(derivaLng.siguiente(), latBase);

      try {
        const resultado = await enviarPosicion(token, lat, lng);
        if (resultado === "rate_limited") {
          console.warn(`[${conductor.rut}] 429 inesperado, se salta este tick`);
        } else if (tick % 5 === 0) {
          console.log(`[${conductor.rut}] ${lat.toFixed(6)}, ${lng.toFixed(6)}`);
        }
      } catch (err) {
        console.error(`[${conductor.rut}] error enviando posicion:`, err);
      }

      tick++;
      await sleep(INTERVALO_MS);
    }

    segmento++;
  }

  console.log(`[${conductor.rut}] fin de simulacion`);
}

async function main() {
  console.log(`Simulando ${SIM_CONDUCTORES.length} conductores contra ${BASE_URL}`);
  console.log(
    DURACION_MIN > 0
      ? `Duracion: ${DURACION_MIN} min`
      : "Duracion: indefinida (Ctrl+C para cortar)"
  );

  const finGlobal = DURACION_MIN > 0 ? Date.now() + DURACION_MIN * 60_000 : 0;
  const pasoInicialEntreConductores = Math.floor(RUTA.length / SIM_CONDUCTORES.length);

  await Promise.all(
    SIM_CONDUCTORES.map((conductor, i) =>
      simularConductor(conductor, i * pasoInicialEntreConductores, i * 1500, finGlobal)
    )
  );

  console.log("Simulacion terminada.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
