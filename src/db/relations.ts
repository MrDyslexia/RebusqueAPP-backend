import { relations } from "drizzle-orm/relations";
import { usuarios, sesiones, dispositivos, passwordResetTokens, dispositivosHistorial, turnos, sucursales, encomiendas, encomiendaEstadoHistorial, reportesEntregaFallida, posicionesConductor, notificacionesLog } from "./schema";

export const sesionesRelations = relations(sesiones, ({one}) => ({
	usuario: one(usuarios, {
		fields: [sesiones.usuarioId],
		references: [usuarios.id]
	}),
	dispositivo: one(dispositivos, {
		fields: [sesiones.dispositivoId],
		references: [dispositivos.id]
	}),
}));

export const usuariosRelations = relations(usuarios, ({one, many}) => ({
	sesiones: many(sesiones),
	passwordResetTokens: many(passwordResetTokens),
	dispositivos: many(dispositivos),
	dispositivosHistorials: many(dispositivosHistorial),
	turnos: many(turnos),
	encomiendas_remitenteId: many(encomiendas, {
		relationName: "encomiendas_remitenteId_usuarios_id"
	}),
	encomiendas_conductorAsignadoId: many(encomiendas, {
		relationName: "encomiendas_conductorAsignadoId_usuarios_id"
	}),
	encomiendas_creadoPor: many(encomiendas, {
		relationName: "encomiendas_creadoPor_usuarios_id"
	}),
	encomiendaEstadoHistorials: many(encomiendaEstadoHistorial),
	reportesEntregaFallidas: many(reportesEntregaFallida),
	posicionesConductors: many(posicionesConductor),
	notificacionesLogs: many(notificacionesLog),
	usuario: one(usuarios, {
		fields: [usuarios.creadoPor],
		references: [usuarios.id],
		relationName: "usuarios_creadoPor_usuarios_id"
	}),
	usuarios: many(usuarios, {
		relationName: "usuarios_creadoPor_usuarios_id"
	}),
}));

export const dispositivosRelations = relations(dispositivos, ({one, many}) => ({
	sesiones: many(sesiones),
	usuario: one(usuarios, {
		fields: [dispositivos.usuarioId],
		references: [usuarios.id]
	}),
}));

export const passwordResetTokensRelations = relations(passwordResetTokens, ({one}) => ({
	usuario: one(usuarios, {
		fields: [passwordResetTokens.usuarioId],
		references: [usuarios.id]
	}),
}));

export const dispositivosHistorialRelations = relations(dispositivosHistorial, ({one}) => ({
	usuario: one(usuarios, {
		fields: [dispositivosHistorial.usuarioId],
		references: [usuarios.id]
	}),
}));

export const turnosRelations = relations(turnos, ({one, many}) => ({
	usuario: one(usuarios, {
		fields: [turnos.conductorId],
		references: [usuarios.id]
	}),
	sucursale: one(sucursales, {
		fields: [turnos.sucursalId],
		references: [sucursales.id]
	}),
	posicionesConductors: many(posicionesConductor),
}));

export const sucursalesRelations = relations(sucursales, ({many}) => ({
	turnos: many(turnos),
	encomiendas_sucursalOrigenId: many(encomiendas, {
		relationName: "encomiendas_sucursalOrigenId_sucursales_id"
	}),
	encomiendas_sucursalDestinoId: many(encomiendas, {
		relationName: "encomiendas_sucursalDestinoId_sucursales_id"
	}),
}));

export const encomiendasRelations = relations(encomiendas, ({one, many}) => ({
	usuario_remitenteId: one(usuarios, {
		fields: [encomiendas.remitenteId],
		references: [usuarios.id],
		relationName: "encomiendas_remitenteId_usuarios_id"
	}),
	sucursale_sucursalOrigenId: one(sucursales, {
		fields: [encomiendas.sucursalOrigenId],
		references: [sucursales.id],
		relationName: "encomiendas_sucursalOrigenId_sucursales_id"
	}),
	sucursale_sucursalDestinoId: one(sucursales, {
		fields: [encomiendas.sucursalDestinoId],
		references: [sucursales.id],
		relationName: "encomiendas_sucursalDestinoId_sucursales_id"
	}),
	usuario_conductorAsignadoId: one(usuarios, {
		fields: [encomiendas.conductorAsignadoId],
		references: [usuarios.id],
		relationName: "encomiendas_conductorAsignadoId_usuarios_id"
	}),
	usuario_creadoPor: one(usuarios, {
		fields: [encomiendas.creadoPor],
		references: [usuarios.id],
		relationName: "encomiendas_creadoPor_usuarios_id"
	}),
	encomiendaEstadoHistorials: many(encomiendaEstadoHistorial),
	reportesEntregaFallidas: many(reportesEntregaFallida),
	notificacionesLogs: many(notificacionesLog),
}));

export const encomiendaEstadoHistorialRelations = relations(encomiendaEstadoHistorial, ({one}) => ({
	encomienda: one(encomiendas, {
		fields: [encomiendaEstadoHistorial.encomiendaId],
		references: [encomiendas.id]
	}),
	usuario: one(usuarios, {
		fields: [encomiendaEstadoHistorial.cambiadoPor],
		references: [usuarios.id]
	}),
}));

export const reportesEntregaFallidaRelations = relations(reportesEntregaFallida, ({one}) => ({
	encomienda: one(encomiendas, {
		fields: [reportesEntregaFallida.encomiendaId],
		references: [encomiendas.id]
	}),
	usuario: one(usuarios, {
		fields: [reportesEntregaFallida.conductorId],
		references: [usuarios.id]
	}),
}));

export const posicionesConductorRelations = relations(posicionesConductor, ({one}) => ({
	usuario: one(usuarios, {
		fields: [posicionesConductor.conductorId],
		references: [usuarios.id]
	}),
	turno: one(turnos, {
		fields: [posicionesConductor.turnoId],
		references: [turnos.id]
	}),
}));

export const notificacionesLogRelations = relations(notificacionesLog, ({one}) => ({
	usuario: one(usuarios, {
		fields: [notificacionesLog.usuarioId],
		references: [usuarios.id]
	}),
	encomienda: one(encomiendas, {
		fields: [notificacionesLog.encomiendaId],
		references: [encomiendas.id]
	}),
}));