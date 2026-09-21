import { z } from "zod";

export const registrarPosicionBodySchema = z.object({
  latitud: z.number().min(-90).max(90),
  longitud: z.number().min(-180).max(180),
});
export type RegistrarPosicionBody = z.infer<typeof registrarPosicionBodySchema>;
