import { randomBytes } from "node:crypto";

// Algoritmo no definido en el vault (ver base-datos.md, "Decisiones/supuestos
// a confirmar"): numero_seguimiento y codigo_qr son TEXT/VARCHAR generados
// por la aplicacion. Se eligio aleatorio (no secuencial) para que el numero
// de seguimiento publico no sea adivinable/enumerable por terceros.

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sin 0/O/1/I, menos confusion humana

function randomFromAlphabet(length: number): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += ALPHABET[bytes[i]! % ALPHABET.length];
  }
  return out;
}

/** Publico, se le dicta al cliente/lo escribe en un formulario: corto y legible. */
export function generateNumeroSeguimiento(): string {
  return `RBQ-${randomFromAlphabet(8)}`;
}

/** Interno, solo lo lee un scanner QR: mas entropia, no necesita ser legible. */
export function generateCodigoQr(): string {
  return randomBytes(16).toString("hex");
}
