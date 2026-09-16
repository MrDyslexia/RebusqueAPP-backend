import { z } from "zod";

export const tipoDocumentoSchema = z.enum(["boleta", "factura"]);
export const formaPagoSchema = z.enum(["transferencia", "debito", "credito", "efectivo"]);
export const estadoPagoSchema = z.enum(["pagado", "por_pagar"]);

export const crearEncomiendaBodySchema = z.object({
  remitenteRut: z.string().min(3),
  // Solo se usa si hay que auto-crear la cuenta cliente (no existe ese RUT todavia).
  remitenteEmail: z.string().email().optional(),
  destinatarioNombre: z.string().min(1),
  destinatarioTelefono: z.string().min(1).optional(),
  destinatarioRut: z.string().min(3).optional(),
  direccionEnvio: z.string().min(1),
  direccionRetiro: z.string().min(1).optional(),
  sucursalOrigenId: z.number().int().positive().optional(),
  sucursalDestinoId: z.number().int().positive().optional(),
  totalAPagar: z.number().positive(),
  tipoDocumento: tipoDocumentoSchema,
  formaPago: formaPagoSchema,
});
export type CrearEncomiendaBody = z.infer<typeof crearEncomiendaBodySchema>;

export const asignarConductorBodySchema = z.object({
  conductorId: z.number().int().positive(),
});

export const decidirPostRetiroBodySchema = z.object({
  decision: z.enum(["mismo_dia", "sucursal"]),
});

export const entregarBodySchema = z.object({
  fotoEntregaBase64: z.string().optional(),
});

export const reportarFallidaBodySchema = z.object({
  motivo: z.string().min(1),
  fotoReporteBase64: z.string().optional(),
});

export const cancelarBodySchema = z.object({
  motivo: z.string().optional(),
});

export const cambiarPagoBodySchema = z.object({
  estadoPago: estadoPagoSchema,
});

export const listarEncomiendasQuerySchema = z.object({
  estado: z
    .enum([
      "procesando",
      "asignada",
      "en_ruta",
      "retirado",
      "en_sucursal",
      "en_reparto",
      "entregada",
      "fallida",
      "finalizada",
    ])
    .optional(),
});
