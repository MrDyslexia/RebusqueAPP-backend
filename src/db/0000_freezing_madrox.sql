-- Current sql file was generated after introspecting the database
-- If you want to run this migration please uncomment this code before executing migrations
/*
CREATE TYPE "public"."canal_notificacion" AS ENUM('correo', 'push');--> statement-breakpoint
CREATE TYPE "public"."estado_encomienda" AS ENUM('procesando', 'asignada', 'en_ruta', 'retirado', 'en_sucursal', 'en_reparto', 'entregada', 'fallida', 'finalizada');--> statement-breakpoint
CREATE TYPE "public"."estado_pago" AS ENUM('pagado', 'por_pagar');--> statement-breakpoint
CREATE TYPE "public"."forma_pago" AS ENUM('transferencia', 'debito', 'credito', 'efectivo');--> statement-breakpoint
CREATE TYPE "public"."rol_usuario" AS ENUM('cliente', 'conductor', 'ejecutivo', 'administrador');--> statement-breakpoint
CREATE TYPE "public"."tipo_documento" AS ENUM('boleta', 'factura');--> statement-breakpoint
CREATE TABLE "usuarios" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "usuarios_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"rut" varchar(12) NOT NULL,
	"password_hash" text NOT NULL,
	"email" varchar(255) NOT NULL,
	"rol" "rol_usuario" NOT NULL,
	"creado_por" bigint,
	"activo" boolean DEFAULT true NOT NULL,
	"acceso_seguimiento_bloqueado" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usuarios_rut_key" UNIQUE("rut"),
	CONSTRAINT "usuarios_email_key" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "sesiones" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "sesiones_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"usuario_id" bigint NOT NULL,
	"dispositivo_id" bigint NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "sesiones_token_key" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "password_reset_tokens_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"usuario_id" bigint NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "password_reset_tokens_token_key" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "dispositivos" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "dispositivos_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"usuario_id" bigint NOT NULL,
	"device_identifier" text NOT NULL,
	"fcm_token" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dispositivos_usuario_id_key" UNIQUE("usuario_id")
);
--> statement-breakpoint
CREATE TABLE "dispositivos_historial" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "dispositivos_historial_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"usuario_id" bigint NOT NULL,
	"device_identifier_anterior" text,
	"device_identifier_nuevo" text NOT NULL,
	"reemplazado_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "turnos" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "turnos_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"conductor_id" bigint NOT NULL,
	"sucursal_id" bigint NOT NULL,
	"fecha" date NOT NULL,
	"hora_inicio" time NOT NULL,
	"hora_fin" time NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_turno_horario" CHECK (hora_fin > hora_inicio)
);
--> statement-breakpoint
CREATE TABLE "sucursales" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "sucursales_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"nombre" varchar(150) NOT NULL,
	"direccion" text NOT NULL,
	"activa" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "encomiendas" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "encomiendas_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"numero_seguimiento" varchar(20) NOT NULL,
	"codigo_qr" text NOT NULL,
	"remitente_id" bigint NOT NULL,
	"destinatario_nombre" varchar(150) NOT NULL,
	"destinatario_telefono" varchar(20),
	"destinatario_rut" varchar(12),
	"direccion_envio" text NOT NULL,
	"direccion_retiro" text,
	"sucursal_origen_id" bigint,
	"sucursal_destino_id" bigint,
	"estado" "estado_encomienda" DEFAULT 'procesando' NOT NULL,
	"conductor_asignado_id" bigint,
	"intentos_fallidos" smallint DEFAULT 0 NOT NULL,
	"total_a_pagar" numeric(12, 2) NOT NULL,
	"tipo_documento" "tipo_documento" NOT NULL,
	"forma_pago" "forma_pago" NOT NULL,
	"estado_pago" "estado_pago" DEFAULT 'por_pagar' NOT NULL,
	"foto_entrega" "bytea",
	"creado_por" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "encomiendas_numero_seguimiento_key" UNIQUE("numero_seguimiento"),
	CONSTRAINT "encomiendas_codigo_qr_key" UNIQUE("codigo_qr")
);
--> statement-breakpoint
CREATE TABLE "encomienda_estado_historial" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "encomienda_estado_historial_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"encomienda_id" bigint NOT NULL,
	"estado" "estado_encomienda" NOT NULL,
	"cambiado_por" bigint,
	"comentario" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reportes_entrega_fallida" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "reportes_entrega_fallida_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"encomienda_id" bigint NOT NULL,
	"conductor_id" bigint NOT NULL,
	"motivo" text NOT NULL,
	"foto_reporte" "bytea",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "posiciones_conductor" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "posiciones_conductor_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"conductor_id" bigint NOT NULL,
	"turno_id" bigint,
	"latitud" numeric(9, 6) NOT NULL,
	"longitud" numeric(9, 6) NOT NULL,
	"capturado_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notificaciones_log" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "notificaciones_log_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"usuario_id" bigint NOT NULL,
	"encomienda_id" bigint,
	"canal" "canal_notificacion" NOT NULL,
	"evento" varchar(100) NOT NULL,
	"enviado_at" timestamp with time zone,
	"exitoso" boolean,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_creado_por_fkey" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sesiones" ADD CONSTRAINT "sesiones_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sesiones" ADD CONSTRAINT "sesiones_dispositivo_id_fkey" FOREIGN KEY ("dispositivo_id") REFERENCES "public"."dispositivos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispositivos" ADD CONSTRAINT "dispositivos_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispositivos_historial" ADD CONSTRAINT "dispositivos_historial_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turnos" ADD CONSTRAINT "turnos_conductor_id_fkey" FOREIGN KEY ("conductor_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turnos" ADD CONSTRAINT "turnos_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "public"."sucursales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "encomiendas" ADD CONSTRAINT "encomiendas_remitente_id_fkey" FOREIGN KEY ("remitente_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "encomiendas" ADD CONSTRAINT "encomiendas_sucursal_origen_id_fkey" FOREIGN KEY ("sucursal_origen_id") REFERENCES "public"."sucursales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "encomiendas" ADD CONSTRAINT "encomiendas_sucursal_destino_id_fkey" FOREIGN KEY ("sucursal_destino_id") REFERENCES "public"."sucursales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "encomiendas" ADD CONSTRAINT "encomiendas_conductor_asignado_id_fkey" FOREIGN KEY ("conductor_asignado_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "encomiendas" ADD CONSTRAINT "encomiendas_creado_por_fkey" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "encomienda_estado_historial" ADD CONSTRAINT "encomienda_estado_historial_encomienda_id_fkey" FOREIGN KEY ("encomienda_id") REFERENCES "public"."encomiendas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "encomienda_estado_historial" ADD CONSTRAINT "encomienda_estado_historial_cambiado_por_fkey" FOREIGN KEY ("cambiado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reportes_entrega_fallida" ADD CONSTRAINT "reportes_entrega_fallida_encomienda_id_fkey" FOREIGN KEY ("encomienda_id") REFERENCES "public"."encomiendas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reportes_entrega_fallida" ADD CONSTRAINT "reportes_entrega_fallida_conductor_id_fkey" FOREIGN KEY ("conductor_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posiciones_conductor" ADD CONSTRAINT "posiciones_conductor_conductor_id_fkey" FOREIGN KEY ("conductor_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posiciones_conductor" ADD CONSTRAINT "posiciones_conductor_turno_id_fkey" FOREIGN KEY ("turno_id") REFERENCES "public"."turnos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notificaciones_log" ADD CONSTRAINT "notificaciones_log_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notificaciones_log" ADD CONSTRAINT "notificaciones_log_encomienda_id_fkey" FOREIGN KEY ("encomienda_id") REFERENCES "public"."encomiendas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_usuarios_rol" ON "usuarios" USING btree ("rol" enum_ops);--> statement-breakpoint
CREATE INDEX "idx_sesiones_usuario" ON "sesiones" USING btree ("usuario_id" int8_ops);--> statement-breakpoint
CREATE INDEX "idx_turnos_conductor_fecha" ON "turnos" USING btree ("conductor_id" date_ops,"fecha" date_ops);--> statement-breakpoint
CREATE INDEX "idx_turnos_sucursal_fecha" ON "turnos" USING btree ("sucursal_id" int8_ops,"fecha" int8_ops);--> statement-breakpoint
CREATE INDEX "idx_encomiendas_conductor" ON "encomiendas" USING btree ("conductor_asignado_id" int8_ops);--> statement-breakpoint
CREATE INDEX "idx_encomiendas_estado" ON "encomiendas" USING btree ("estado" enum_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "idx_encomiendas_numero_seguimiento" ON "encomiendas" USING btree ("numero_seguimiento" text_ops);--> statement-breakpoint
CREATE INDEX "idx_encomiendas_remitente" ON "encomiendas" USING btree ("remitente_id" int8_ops);--> statement-breakpoint
CREATE INDEX "idx_historial_encomienda" ON "encomienda_estado_historial" USING btree ("encomienda_id" int8_ops,"created_at" int8_ops);--> statement-breakpoint
CREATE INDEX "idx_reportes_encomienda" ON "reportes_entrega_fallida" USING btree ("encomienda_id" int8_ops);--> statement-breakpoint
CREATE INDEX "idx_posiciones_conductor_tiempo" ON "posiciones_conductor" USING btree ("conductor_id" int8_ops,"capturado_at" int8_ops);--> statement-breakpoint
CREATE INDEX "idx_notificaciones_usuario" ON "notificaciones_log" USING btree ("usuario_id" int8_ops);
*/