import { z } from "zod";

export const crearSucursalBodySchema = z.object({
  nombre: z.string().min(1).max(150),
  direccion: z.string().min(1),
});

export const actualizarSucursalBodySchema = z.object({
  nombre: z.string().min(1).max(150).optional(),
  direccion: z.string().min(1).optional(),
  activa: z.boolean().optional(),
});

export const listarSucursalesQuerySchema = z.object({
  activa: z.coerce.boolean().optional(),
});
