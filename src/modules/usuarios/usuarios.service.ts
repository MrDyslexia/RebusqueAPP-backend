import { or, eq, ne, and, isNull, asc } from "drizzle-orm";
import { db } from "../../db/index.js";
import { usuarios, sesiones } from "../../db/schema.js";
import { normalizeRut } from "../../lib/rut.js";
import { hashPassword } from "../../lib/security.js";
import { Errors, AppError } from "../../lib/errors.js";
import type { AuthUser } from "../../plugins/auth.js";
import { listarEncomiendasPorCreador, listarEncomiendasPorRemitente } from "../encomiendas/encomiendas.service.js";
import type { CrearUsuarioBody, rolUsuarioSchema } from "./usuarios.schemas.js";
import type { z } from "zod";

type Rol = z.infer<typeof rolUsuarioSchema>;

// Reglas del vault (backend.md): administrador crea cualquier rol; ejecutivo
// solo cliente; conductor y cliente no pueden crear usuarios.
function puedeCrearRol(creador: AuthUser["rol"], rolObjetivo: CrearUsuarioBody["rol"]): boolean {
  if (creador === "administrador") return true;
  if (creador === "ejecutivo") return rolObjetivo === "cliente";
  return false;
}

export async function crearUsuario(creador: AuthUser, input: CrearUsuarioBody) {
  if (!puedeCrearRol(creador.rol, input.rol)) {
    throw Errors.forbidden(`El rol '${creador.rol}' no puede crear usuarios de rol '${input.rol}'`);
  }

  let rut: string;
  try {
    rut = normalizeRut(input.rut);
  } catch {
    throw Errors.invalidRut(input.rut);
  }

  const existente = await db
    .select({ id: usuarios.id })
    .from(usuarios)
    .where(or(eq(usuarios.rut, rut), eq(usuarios.email, input.email)))
    .limit(1);

  if (existente.length > 0) throw Errors.duplicateRutOrEmail();

  const passwordHash = await hashPassword(input.password);

  const [nuevo] = await db
    .insert(usuarios)
    .values({
      rut,
      email: input.email,
      primerNombre: input.primerNombre,
      segundoNombre: input.segundoNombre,
      primerApellido: input.primerApellido,
      segundoApellido: input.segundoApellido,
      passwordHash,
      rol: input.rol,
      creadoPor: creador.id,
    })
    .returning({
      id: usuarios.id,
      rut: usuarios.rut,
      email: usuarios.email,
      primerNombre: usuarios.primerNombre,
      segundoNombre: usuarios.segundoNombre,
      primerApellido: usuarios.primerApellido,
      segundoApellido: usuarios.segundoApellido,
      rol: usuarios.rol,
      createdAt: usuarios.createdAt,
    });

  if (!nuevo) throw new AppError(500, "insert_failed", "No se pudo crear el usuario");
  return nuevo;
}

// Lectura: ejecutivo tambien la necesita (gestion de usuarios/clientes en la
// web, seleccionar conductor al asignar encomiendas). Nunca expone
// password_hash.
export async function listarUsuarios(rol?: Rol) {
  const columnas = {
    id: usuarios.id,
    rut: usuarios.rut,
    email: usuarios.email,
    primerNombre: usuarios.primerNombre,
    segundoNombre: usuarios.segundoNombre,
    primerApellido: usuarios.primerApellido,
    segundoApellido: usuarios.segundoApellido,
    rol: usuarios.rol,
    activo: usuarios.activo,
    // Solo tiene sentido para rol 'ejecutivo'; en el resto de los roles
    // siempre viaja `false` (default de columna) y no se usa.
    accesoSeguimientoBloqueado: usuarios.accesoSeguimientoBloqueado,
    createdAt: usuarios.createdAt,
  };

  // PostgreSQL no garantiza orden sin ORDER BY. Una mutacion como el toggle
  // de seguimiento fuerza un refetch; sin orden estable la misma fila podia
  // reaparecer en otra posicion aunque ningun dato visual de la tabla cambiara.
  if (rol) return db.select(columnas).from(usuarios).where(eq(usuarios.rol, rol)).orderBy(asc(usuarios.id));
  return db.select(columnas).from(usuarios).orderBy(asc(usuarios.id));
}

// El historial se define por remitente_id: un cliente puede ser quien envía
// muchas encomiendas, pero no necesariamente el destinatario de una ajena.
// Validar el rol evita que la ruta se use por accidente como historial de un
// trabajador, que no tiene el mismo significado operativo.
export async function listarEncomiendasDeCliente(usuarioId: number) {
  const [usuario] = await db
    .select({ id: usuarios.id, rol: usuarios.rol })
    .from(usuarios)
    .where(eq(usuarios.id, usuarioId))
    .limit(1);

  if (!usuario) throw Errors.notFound("Usuario");
  if (usuario.rol !== "cliente") {
    throw new AppError(400, "usuario_no_es_cliente", "El historial de encomiendas solo aplica a clientes");
  }

  return listarEncomiendasPorRemitente(usuario.id);
}

export async function listarEncomiendasCreadasPorEjecutivo(usuarioId: number) {
  const [usuario] = await db
    .select({ id: usuarios.id, rol: usuarios.rol })
    .from(usuarios)
    .where(eq(usuarios.id, usuarioId))
    .limit(1);

  if (!usuario) throw Errors.notFound("Usuario");
  if (usuario.rol !== "ejecutivo") {
    throw new AppError(400, "usuario_no_es_ejecutivo", "El historial de creación solo aplica a ejecutivos");
  }

  return listarEncomiendasPorCreador(usuario.id);
}

function requireAdmin(actor: AuthUser) {
  if (actor.rol !== "administrador") {
    throw Errors.forbidden("Solo administrador puede realizar esta accion");
  }
}

// "administrador puede forzar el reset de contraseña de cualquier usuario"
// (backend.md). Accion administrativa directa, sin correo (eso es la
// recuperacion autoservicio, que se implementa mas adelante). Se revocan
// las sesiones activas del usuario: si le cambiaron la contraseña, cualquier
// sesion vigente con la contraseña vieja deja de tener sentido.
export async function forzarResetPassword(actor: AuthUser, usuarioId: number, newPassword: string) {
  requireAdmin(actor);

  const [usuario] = await db.select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.id, usuarioId)).limit(1);
  if (!usuario) throw Errors.notFound("Usuario");

  const passwordHash = await hashPassword(newPassword);

  await db.transaction(async (tx) => {
    await tx
      .update(usuarios)
      .set({ passwordHash, updatedAt: new Date().toISOString() })
      .where(eq(usuarios.id, usuarioId));

    await tx
      .update(sesiones)
      .set({ revokedAt: new Date().toISOString() })
      .where(and(eq(sesiones.usuarioId, usuarioId), isNull(sesiones.revokedAt)));
  });

  return { id: usuarioId };
}

// "administrador puede ... cambiar el correo de otro usuario" (backend.md).
export async function cambiarEmailDeUsuario(actor: AuthUser, usuarioId: number, newEmail: string) {
  requireAdmin(actor);

  const [usuario] = await db.select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.id, usuarioId)).limit(1);
  if (!usuario) throw Errors.notFound("Usuario");

  const [enUso] = await db
    .select({ id: usuarios.id })
    .from(usuarios)
    .where(and(eq(usuarios.email, newEmail), ne(usuarios.id, usuarioId)))
    .limit(1);
  if (enUso) throw Errors.emailEnUso();

  await db
    .update(usuarios)
    .set({ email: newEmail, updatedAt: new Date().toISOString() })
    .where(eq(usuarios.id, usuarioId));

  return { id: usuarioId, email: newEmail };
}

export async function actualizarDatosUsuario(
  actor: AuthUser,
  usuarioId: number,
  datos: {
    email: string;
    primerNombre: string;
    segundoNombre: string;
    primerApellido: string;
    segundoApellido: string;
  }
) {
  requireAdmin(actor);

  const [usuario] = await db.select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.id, usuarioId)).limit(1);
  if (!usuario) throw Errors.notFound("Usuario");

  const [enUso] = await db
    .select({ id: usuarios.id })
    .from(usuarios)
    .where(and(eq(usuarios.email, datos.email), ne(usuarios.id, usuarioId)))
    .limit(1);
  if (enUso) throw Errors.emailEnUso();

  const [actualizado] = await db
    .update(usuarios)
    .set({ ...datos, updatedAt: new Date().toISOString() })
    .where(eq(usuarios.id, usuarioId))
    .returning({
      id: usuarios.id,
      rut: usuarios.rut,
      email: usuarios.email,
      primerNombre: usuarios.primerNombre,
      segundoNombre: usuarios.segundoNombre,
      primerApellido: usuarios.primerApellido,
      segundoApellido: usuarios.segundoApellido,
      rol: usuarios.rol,
      activo: usuarios.activo,
      accesoSeguimientoBloqueado: usuarios.accesoSeguimientoBloqueado,
      createdAt: usuarios.createdAt,
    });

  return actualizado!;
}

// "administrador puede bloquear el acceso de los ejecutivos al seguimiento
// en tiempo real (permiso configurable, no es fijo)" (backend.md, post-MVP
// seguimiento en tiempo real). Solo aplica a rol 'ejecutivo' -- el
// administrador siempre ve el seguimiento, no tiene sentido bloquearlo a
// si mismo; conductor/cliente no consumen ese endpoint en absoluto.
export async function actualizarAccesoSeguimiento(actor: AuthUser, usuarioId: number, bloqueado: boolean) {
  requireAdmin(actor);

  const [usuario] = await db
    .select({ id: usuarios.id, rol: usuarios.rol })
    .from(usuarios)
    .where(eq(usuarios.id, usuarioId))
    .limit(1);
  if (!usuario) throw Errors.notFound("Usuario");
  if (usuario.rol !== "ejecutivo") {
    throw new AppError(
      400,
      "acceso_seguimiento_no_aplica",
      "El bloqueo de seguimiento en tiempo real solo aplica a usuarios con rol ejecutivo"
    );
  }

  await db
    .update(usuarios)
    .set({ accesoSeguimientoBloqueado: bloqueado, updatedAt: new Date().toISOString() })
    .where(eq(usuarios.id, usuarioId));

  return { id: usuarioId, accesoSeguimientoBloqueado: bloqueado };
}
