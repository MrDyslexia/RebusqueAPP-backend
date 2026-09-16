import { createHash, randomBytes } from "node:crypto";

// Passwords: bcrypt nativo de Bun, sin dependencias externas.
export async function hashPassword(password: string): Promise<string> {
  return Bun.password.hash(password, { algorithm: "bcrypt", cost: 10 });
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return Bun.password.verify(password, hash);
}

// Sesiones/reset: tokens opacos (no JWT). El esquema (sesiones.revoked_at,
// password_reset_tokens.used_at) ya modela revocacion server-side explicita,
// que es mas simple y segura que mantener una denylist paralela para JWT.
// Se guarda el hash SHA-256 en la DB; el valor crudo solo existe en la
// respuesta al cliente, una vez.
const RAW_TOKEN_BYTES = 32;

export function generateOpaqueToken(): { raw: string; hash: string } {
  const raw = randomBytes(RAW_TOKEN_BYTES).toString("hex");
  return { raw, hash: hashToken(raw) };
}

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}
