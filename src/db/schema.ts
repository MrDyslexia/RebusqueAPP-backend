import { pgTable, index, foreignKey, unique, bigint, text, timestamp, check, date, time, varchar, boolean, uniqueIndex, smallint, numeric, pgEnum } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { bytea } from "./custom-types.js"

export const canalNotificacion = pgEnum("canal_notificacion", ['correo', 'push'])
export const estadoEncomienda = pgEnum("estado_encomienda", ['procesando', 'asignada', 'en_ruta', 'retirado', 'en_sucursal', 'en_reparto', 'entregada', 'fallida', 'finalizada'])
export const estadoPago = pgEnum("estado_pago", ['pagado', 'por_pagar'])
export const formaPago = pgEnum("forma_pago", ['transferencia', 'debito', 'credito', 'efectivo'])
export const rolUsuario = pgEnum("rol_usuario", ['cliente', 'conductor', 'ejecutivo', 'administrador'])
export const tipoDocumento = pgEnum("tipo_documento", ['boleta', 'factura'])


export const sesiones = pgTable("sesiones", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity({ name: "sesiones_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	usuarioId: bigint("usuario_id", { mode: "number" }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	dispositivoId: bigint("dispositivo_id", { mode: "number" }).notNull(),
	token: text().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: 'string' }).notNull(),
	revokedAt: timestamp("revoked_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("idx_sesiones_usuario").using("btree", table.usuarioId.asc().nullsLast().op("int8_ops")),
	foreignKey({
			columns: [table.usuarioId],
			foreignColumns: [usuarios.id],
			name: "sesiones_usuario_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.dispositivoId],
			foreignColumns: [dispositivos.id],
			name: "sesiones_dispositivo_id_fkey"
		}).onDelete("cascade"),
	unique("sesiones_token_key").on(table.token),
]);

export const passwordResetTokens = pgTable("password_reset_tokens", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity({ name: "password_reset_tokens_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	usuarioId: bigint("usuario_id", { mode: "number" }).notNull(),
	token: text().notNull(),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: 'string' }).notNull(),
	usedAt: timestamp("used_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.usuarioId],
			foreignColumns: [usuarios.id],
			name: "password_reset_tokens_usuario_id_fkey"
		}).onDelete("cascade"),
	unique("password_reset_tokens_token_key").on(table.token),
]);

export const dispositivos = pgTable("dispositivos", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity({ name: "dispositivos_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	usuarioId: bigint("usuario_id", { mode: "number" }).notNull(),
	deviceIdentifier: text("device_identifier").notNull(),
	fcmToken: text("fcm_token"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.usuarioId],
			foreignColumns: [usuarios.id],
			name: "dispositivos_usuario_id_fkey"
		}).onDelete("cascade"),
	unique("dispositivos_usuario_id_key").on(table.usuarioId),
]);

export const dispositivosHistorial = pgTable("dispositivos_historial", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity({ name: "dispositivos_historial_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	usuarioId: bigint("usuario_id", { mode: "number" }).notNull(),
	deviceIdentifierAnterior: text("device_identifier_anterior"),
	deviceIdentifierNuevo: text("device_identifier_nuevo").notNull(),
	reemplazadoAt: timestamp("reemplazado_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.usuarioId],
			foreignColumns: [usuarios.id],
			name: "dispositivos_historial_usuario_id_fkey"
		}).onDelete("cascade"),
]);

export const turnos = pgTable("turnos", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity({ name: "turnos_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	conductorId: bigint("conductor_id", { mode: "number" }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	sucursalId: bigint("sucursal_id", { mode: "number" }).notNull(),
	fecha: date().notNull(),
	horaInicio: time("hora_inicio").notNull(),
	horaFin: time("hora_fin").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_turnos_conductor_fecha").using("btree", table.conductorId.asc().nullsLast().op("date_ops"), table.fecha.asc().nullsLast().op("date_ops")),
	index("idx_turnos_sucursal_fecha").using("btree", table.sucursalId.asc().nullsLast().op("int8_ops"), table.fecha.asc().nullsLast().op("int8_ops")),
	foreignKey({
			columns: [table.conductorId],
			foreignColumns: [usuarios.id],
			name: "turnos_conductor_id_fkey"
		}),
	foreignKey({
			columns: [table.sucursalId],
			foreignColumns: [sucursales.id],
			name: "turnos_sucursal_id_fkey"
		}),
	check("chk_turno_horario", sql`hora_fin > hora_inicio`),
]);

export const sucursales = pgTable("sucursales", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity({ name: "sucursales_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	nombre: varchar({ length: 150 }).notNull(),
	direccion: text().notNull(),
	activa: boolean().default(true).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const encomiendas = pgTable("encomiendas", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity({ name: "encomiendas_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	numeroSeguimiento: varchar("numero_seguimiento", { length: 20 }).notNull(),
	codigoQr: text("codigo_qr").notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	remitenteId: bigint("remitente_id", { mode: "number" }).notNull(),
	destinatarioNombre: varchar("destinatario_nombre", { length: 150 }).notNull(),
	destinatarioTelefono: varchar("destinatario_telefono", { length: 20 }),
	destinatarioRut: varchar("destinatario_rut", { length: 12 }),
	direccionEnvio: text("direccion_envio").notNull(),
	direccionRetiro: text("direccion_retiro"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	sucursalOrigenId: bigint("sucursal_origen_id", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	sucursalDestinoId: bigint("sucursal_destino_id", { mode: "number" }),
	estado: estadoEncomienda().default('procesando').notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	conductorAsignadoId: bigint("conductor_asignado_id", { mode: "number" }),
	intentosFallidos: smallint("intentos_fallidos").default(0).notNull(),
	totalAPagar: numeric("total_a_pagar", { precision: 12, scale:  2 }).notNull(),
	tipoDocumento: tipoDocumento("tipo_documento").notNull(),
	formaPago: formaPago("forma_pago").notNull(),
	estadoPago: estadoPago("estado_pago").default('por_pagar').notNull(),
	// TODO: failed to parse database type 'bytea'
	fotoEntrega: bytea("foto_entrega"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	creadoPor: bigint("creado_por", { mode: "number" }).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_encomiendas_conductor").using("btree", table.conductorAsignadoId.asc().nullsLast().op("int8_ops")),
	index("idx_encomiendas_estado").using("btree", table.estado.asc().nullsLast().op("enum_ops")),
	uniqueIndex("idx_encomiendas_numero_seguimiento").using("btree", table.numeroSeguimiento.asc().nullsLast().op("text_ops")),
	index("idx_encomiendas_remitente").using("btree", table.remitenteId.asc().nullsLast().op("int8_ops")),
	foreignKey({
			columns: [table.remitenteId],
			foreignColumns: [usuarios.id],
			name: "encomiendas_remitente_id_fkey"
		}),
	foreignKey({
			columns: [table.sucursalOrigenId],
			foreignColumns: [sucursales.id],
			name: "encomiendas_sucursal_origen_id_fkey"
		}),
	foreignKey({
			columns: [table.sucursalDestinoId],
			foreignColumns: [sucursales.id],
			name: "encomiendas_sucursal_destino_id_fkey"
		}),
	foreignKey({
			columns: [table.conductorAsignadoId],
			foreignColumns: [usuarios.id],
			name: "encomiendas_conductor_asignado_id_fkey"
		}),
	foreignKey({
			columns: [table.creadoPor],
			foreignColumns: [usuarios.id],
			name: "encomiendas_creado_por_fkey"
		}),
	unique("encomiendas_numero_seguimiento_key").on(table.numeroSeguimiento),
	unique("encomiendas_codigo_qr_key").on(table.codigoQr),
]);

export const encomiendaEstadoHistorial = pgTable("encomienda_estado_historial", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity({ name: "encomienda_estado_historial_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	encomiendaId: bigint("encomienda_id", { mode: "number" }).notNull(),
	estado: estadoEncomienda().notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	cambiadoPor: bigint("cambiado_por", { mode: "number" }),
	comentario: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_historial_encomienda").using("btree", table.encomiendaId.asc().nullsLast().op("int8_ops"), table.createdAt.asc().nullsLast().op("int8_ops")),
	foreignKey({
			columns: [table.encomiendaId],
			foreignColumns: [encomiendas.id],
			name: "encomienda_estado_historial_encomienda_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.cambiadoPor],
			foreignColumns: [usuarios.id],
			name: "encomienda_estado_historial_cambiado_por_fkey"
		}),
]);

export const reportesEntregaFallida = pgTable("reportes_entrega_fallida", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity({ name: "reportes_entrega_fallida_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	encomiendaId: bigint("encomienda_id", { mode: "number" }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	conductorId: bigint("conductor_id", { mode: "number" }).notNull(),
	motivo: text().notNull(),
	// TODO: failed to parse database type 'bytea'
	fotoReporte: bytea("foto_reporte"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_reportes_encomienda").using("btree", table.encomiendaId.asc().nullsLast().op("int8_ops")),
	foreignKey({
			columns: [table.encomiendaId],
			foreignColumns: [encomiendas.id],
			name: "reportes_entrega_fallida_encomienda_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.conductorId],
			foreignColumns: [usuarios.id],
			name: "reportes_entrega_fallida_conductor_id_fkey"
		}),
]);

export const posicionesConductor = pgTable("posiciones_conductor", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity({ name: "posiciones_conductor_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	conductorId: bigint("conductor_id", { mode: "number" }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	turnoId: bigint("turno_id", { mode: "number" }),
	latitud: numeric({ precision: 9, scale:  6 }).notNull(),
	longitud: numeric({ precision: 9, scale:  6 }).notNull(),
	capturadoAt: timestamp("capturado_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_posiciones_conductor_tiempo").using("btree", table.conductorId.asc().nullsLast().op("int8_ops"), table.capturadoAt.asc().nullsLast().op("int8_ops")),
	foreignKey({
			columns: [table.conductorId],
			foreignColumns: [usuarios.id],
			name: "posiciones_conductor_conductor_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.turnoId],
			foreignColumns: [turnos.id],
			name: "posiciones_conductor_turno_id_fkey"
		}),
]);

export const notificacionesLog = pgTable("notificaciones_log", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity({ name: "notificaciones_log_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	usuarioId: bigint("usuario_id", { mode: "number" }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	encomiendaId: bigint("encomienda_id", { mode: "number" }),
	canal: canalNotificacion().notNull(),
	evento: varchar({ length: 100 }).notNull(),
	enviadoAt: timestamp("enviado_at", { withTimezone: true, mode: 'string' }),
	exitoso: boolean(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_notificaciones_usuario").using("btree", table.usuarioId.asc().nullsLast().op("int8_ops")),
	foreignKey({
			columns: [table.usuarioId],
			foreignColumns: [usuarios.id],
			name: "notificaciones_log_usuario_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.encomiendaId],
			foreignColumns: [encomiendas.id],
			name: "notificaciones_log_encomienda_id_fkey"
		}),
]);

export const usuarios = pgTable("usuarios", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity({ name: "usuarios_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	rut: varchar({ length: 12 }).notNull(),
	passwordHash: text("password_hash").notNull(),
	email: varchar({ length: 255 }).notNull(),
	rol: rolUsuario().notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	creadoPor: bigint("creado_por", { mode: "number" }),
	activo: boolean().default(true).notNull(),
	accesoSeguimientoBloqueado: boolean("acceso_seguimiento_bloqueado").default(false).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	primerNombre: varchar("primer_nombre", { length: 80 }),
	segundoNombre: varchar("segundo_nombre", { length: 80 }),
	primerApellido: varchar("primer_apellido", { length: 80 }),
	segundoApellido: varchar("segundo_apellido", { length: 80 }),
}, (table) => [
	index("idx_usuarios_rol").using("btree", table.rol.asc().nullsLast().op("enum_ops")),
	foreignKey({
			columns: [table.creadoPor],
			foreignColumns: [table.id],
			name: "usuarios_creado_por_fkey"
		}),
	unique("usuarios_rut_key").on(table.rut),
	unique("usuarios_email_key").on(table.email),
]);
