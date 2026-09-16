// Validacion de RUT chileno (modulo 11). Acepta con o sin puntos/guion,
// normaliza a formato canonico "12345678-9" (sin puntos, guion, DV en mayuscula).

export function cleanRut(input: string): string {
  return input.replace(/[.\s]/g, "").toUpperCase();
}

function splitRut(cleaned: string): { body: string; dv: string } | null {
  const match = /^(\d{1,8})-?([\dK])$/.exec(cleaned);
  if (!match) return null;
  return { body: match[1]!, dv: match[2]! };
}

export function computeDv(body: string): string {
  let sum = 0;
  let multiplier = 2;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += Number(body[i]) * multiplier;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }
  const remainder = 11 - (sum % 11);
  if (remainder === 11) return "0";
  if (remainder === 10) return "K";
  return String(remainder);
}

export function isValidRut(input: string): boolean {
  const cleaned = cleanRut(input);
  const parts = splitRut(cleaned);
  if (!parts) return false;
  if (parts.body.length < 7) return false; // RUTs reales parten ~1.000.000
  return computeDv(parts.body) === parts.dv;
}

/** Normaliza a "12345678-9". Lanza si el RUT no es valido. */
export function normalizeRut(input: string): string {
  const cleaned = cleanRut(input);
  const parts = splitRut(cleaned);
  if (!parts || computeDv(parts.body) !== parts.dv) {
    throw new Error(`RUT invalido: ${input}`);
  }
  return `${parts.body}-${parts.dv}`;
}
