import { z } from "zod";

const horaSchema = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "Formato de hora invalido (HH:MM)");
const fechaSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato de fecha invalido (YYYY-MM-DD)");

export const crearTurnoBodySchema = z.object({
  conductorId: z.number().int().positive(),
  sucursalId: z.number().int().positive(),
  fecha: fechaSchema,
  horaInicio: horaSchema,
  horaFin: horaSchema,
});

export const actualizarTurnoBodySchema = z.object({
  conductorId: z.number().int().positive().optional(),
  sucursalId: z.number().int().positive().optional(),
  fecha: fechaSchema.optional(),
  horaInicio: horaSchema.optional(),
  horaFin: horaSchema.optional(),
});

export const listarTurnosQuerySchema = z.object({
  conductorId: z.coerce.number().int().positive().optional(),
  sucursalId: z.coerce.number().int().positive().optional(),
  fecha: fechaSchema.optional(),
});
