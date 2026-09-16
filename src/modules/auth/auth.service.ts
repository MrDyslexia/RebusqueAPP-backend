import { and, eq, isNull, ne } from "drizzle-orm";
import { db } from "../../db/index.js";
import {
  usuarios,
  dispositivos,
  dispositivosHistorial,
  sesiones,
  notificacionesLog,
} from "../../db/schema.js";
import { normalizeRut } from "../../lib/rut.js";
import { hashPassword, verifyPassword, generateOpaqueToken } from "../../lib/security.js";
import { Errors, AppError } from "../../lib/errors.js";
import { env } from "../../config/env.js";
import type { AuthUser } from "../../plugins/auth.js";
import type { LoginBody } from "./auth.schemas.js";

const ROLES_CON_DISPOSITIVO = ["conductor", "ejecutivo", "administrador"] as const;

export async function login(input: LoginBody) {
  let rut: string;
  try {
    rut = normalizeRut(input.rut);
  } catch {
    throw Errors.invalidRut(input.rut);
  }

  const [usuario] = await db.select().from(usuarios).where(eq(usuarios.rut, rut)).limit(1);
  if (!usuario) throw Errors.invalidCredentials();

  if (usuario.rol === "cliente") throw Errors.clientLoginUnavailable();
  if (!usuario.activo) throw Errors.inactiveAccount();

  const passwordOk = await verifyPassword(input.password, usuario.passwordHash);
  if (!passwordOk) throw Errors.invalidCredentials();

  const requiereDispositivo = (ROLES_CON_DISPOSITIVO as readonly string[]).includes(usuario.rol);
  let dispositivoId: number | null = null;

  if (requiereDispositivo) {
    if (!input.deviceIdentifier) {
      throw new AppError(400, "device_identifier_required", "deviceIdentifier es obligatorio para este rol");
    }
    dispositivoId = await upsertDispositivo(usuario.id, input.deviceIdentifier, input.fcmToken);
  }

  // Un solo dispositivo/sesion activa a la vez: se revoca cualquier sesion
  // previa sin expirar del usuario antes de emitir la nueva.
  await db
    .update(sesiones)
    .set({ revokedAt: new Date().toISOString() })
    .where(and(eq(sesiones.usuarioId, usuario.id), isNull(sesiones.revokedAt)));

  const { raw, hash } = generateOpaqueToken();
  const expiresAt = new Date(Date.now() + env.SESSION_TTL_HOURS * 60 * 60 * 1000).toISOString();

  const [sesion] = await db
    .insert(sesiones)
    .values({
      usuarioId: usuario.id,
      // dispositivoId es NOT NULL en el esquema; para roles sin dispositivo
      // (no debería ocurrir, cliente ya fue rechazado arriba) esto fallaria
      // explicitamente en vez de crear una sesion inconsistente.
      dispositivoId: dispositivoId!,
      token: hash,
      expiresAt,
    })
    .returning({ id: sesiones.id });

  return {
    token: raw,
    expiresAt,
    user: {
      id: usuario.id,
      rut: usuario.rut,
      email: usuario.email,
      rol: usuario.rol,
    },
    sesionId: sesion!.id,
  };
}

async function upsertDispositivo(
  usuarioId: number,
  deviceIdentifier: string,
  fcmToken?: string
): Promise<number> {
  const [existente] = await db
    .select()
    .from(dispositivos)
    .where(eq(dispositivos.usuarioId, usuarioId))
    .limit(1);

  if (!existente) {
    const [nuevo] = await db
      .insert(dispositivos)
      .values({ usuarioId, deviceIdentifier, fcmToken: fcmToken ?? null })
      .returning({ id: dispositivos.id });
    return nuevo!.id;
  }

  if (existente.deviceIdentifier !== deviceIdentifier) {
    await db.insert(dispositivosHistorial).values({
      usuarioId,
      deviceIdentifierAnterior: existente.deviceIdentifier,
      deviceIdentifierNuevo: deviceIdentifier,
    });

    await notificarAdministradoresCambioDispositivo(usuarioId);
  }

  await db
    .update(dispositivos)
    .set({
      deviceIdentifier,
      fcmToken: fcmToken ?? existente.fcmToken,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(dispositivos.id, existente.id));

  return existente.id;
}

// Post-MVP: el envio real (correo/push) lo hace un worker de notificaciones
// que aun no existe. Por ahora solo se deja el registro en notificaciones_log
// para que ese worker lo procese cuando se implemente.
async function notificarAdministradoresCambioDispositivo(usuarioReemplazadoId: number) {
  const admins = await db
    .select({ id: usuarios.id })
    .from(usuarios)
    .where(and(eq(usuarios.rol, "administrador"), eq(usuarios.activo, true)));

  if (admins.length === 0) return;

  await db.insert(notificacionesLog).values(
    admins.map((admin) => ({
      usuarioId: admin.id,
      canal: "correo" as const,
      evento: `dispositivo_reemplazado:usuario_${usuarioReemplazadoId}`,
    }))
  );
}

export async function logout(sesionId: number) {
  await db
    .update(sesiones)
    .set({ revokedAt: new Date().toISOString() })
    .where(eq(sesiones.id, sesionId));
}

// "el usuario puede cambiar su propio correo cuando quiera, siempre que
// recuerde su contraseña actual" (backend.md). No requiere email de
// confirmacion: el efecto es inmediato.
export async function cambiarEmailPropio(actor: AuthUser, currentPassword: string, newEmail: string) {
  const [usuario] = await db.select().from(usuarios).where(eq(usuarios.id, actor.id)).limit(1);
  if (!usuario) throw Errors.notFound("Usuario");

  const passwordOk = await verifyPassword(currentPassword, usuario.passwordHash);
  if (!passwordOk) throw Errors.wrongPassword();

  const [enUso] = await db
    .select({ id: usuarios.id })
    .from(usuarios)
    .where(and(eq(usuarios.email, newEmail), ne(usuarios.id, actor.id)))
    .limit(1);
  if (enUso) throw Errors.emailEnUso();

  await db
    .update(usuarios)
    .set({ email: newEmail, updatedAt: new Date().toISOString() })
    .where(eq(usuarios.id, actor.id));

  return { id: usuario.id, email: newEmail };
}
