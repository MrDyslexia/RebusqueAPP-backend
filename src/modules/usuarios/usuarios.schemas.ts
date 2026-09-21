import { z } from "zod";

export const rolUsuarioSchema = z.enum(["cliente", "conductor", "ejecutivo", "administrador"]);

export const crearUsuarioBodySchema = z.object({
  rut: z.string().min(3),
  email: z.string().email(),
  primerNombre: z.string().trim().min(1).max(80),
  segundoNombre: z.string().trim().min(1).max(80),
  primerApellido: z.string().trim().min(1).max(80),
  segundoApellido: z.string().trim().min(1).max(80),
  password: z
    .string()
    .min(8, "La contraseña debe tener al menos 8 caracteres")
    .max(12, "La contraseña no puede superar 12 caracteres"),
  rol: rolUsuarioSchema,
});

export type CrearUsuarioBody = z.infer<typeof crearUsuarioBodySchema>;

export const forzarResetPasswordBodySchema = z.object({
  newPassword: z
    .string()
    .min(8, "La contraseña debe tener al menos 8 caracteres")
    .max(12, "La contraseña no puede superar 12 caracteres"),
});

export const cambiarEmailUsuarioBodySchema = z.object({
  newEmail: z.string().email(),
});

// RUT y rol no participan: el primero es identificador persistente y el
// segundo modifica permisos. Este endpoint solo actualiza datos personales y
// de contacto desde el detalle administrativo de equipo.
export const actualizarDatosUsuarioBodySchema = z.object({
  email: z.string().email(),
  primerNombre: z.string().trim().min(1).max(80),
  segundoNombre: z.string().trim().min(1).max(80),
  primerApellido: z.string().trim().min(1).max(80),
  segundoApellido: z.string().trim().min(1).max(80),
});

export const listarUsuariosQuerySchema = z.object({
  rol: rolUsuarioSchema.optional(),
});

export const actualizarAccesoSeguimientoBodySchema = z.object({
  bloqueado: z.boolean(),
});
