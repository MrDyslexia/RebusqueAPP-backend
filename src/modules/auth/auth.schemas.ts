import { z } from "zod";

export const loginBodySchema = z.object({
  rut: z.string().min(3),
  password: z.string().min(1).max(12, "La contraseña no puede superar 12 caracteres"),
  deviceIdentifier: z.string().min(1).optional(),
  fcmToken: z.string().optional(),
});

export type LoginBody = z.infer<typeof loginBodySchema>;

export const cambiarEmailPropioBodySchema = z.object({
  currentPassword: z.string().min(1).max(12, "La contraseña no puede superar 12 caracteres"),
  newEmail: z.string().email(),
});
export type CambiarEmailPropioBody = z.infer<typeof cambiarEmailPropioBodySchema>;
