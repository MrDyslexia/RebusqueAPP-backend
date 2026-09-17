# RebusqueApp — Backend

Fastify + TypeScript, corriendo en Bun. Acceso a datos vía Drizzle ORM,
database-first: el esquema real vive en `base-datos/init/001_esquema.sql`,
nunca en este módulo.

## Stack

- Runtime: Bun
- Framework: Fastify 5 (+ `@fastify/websocket` para sincronización en tiempo real)
- DB: Drizzle ORM (`drizzle-orm/node-postgres`) + `pg`
- Validación de entorno: Zod

## Esquema de datos (database-first)

`src/db/schema.ts` y `src/db/relations.ts` son **generados**, no se editan a mano.
Cuando cambie `base-datos/init/001_esquema.sql` (y se reaplique en la DB):

```bash
bun run db:pull
```

Esto corre `drizzle-kit pull` contra `DATABASE_URL` y regenera esos dos archivos.

**Gotcha conocido**: `drizzle-kit pull` (v0.31) no mapea columnas `bytea` de
Postgres (`encomiendas.foto_entrega`, `reportes_entrega_fallida.foto_reporte`)
a un tipo válido — genera un placeholder `unknown(...)` que rompe en runtime.
`bun run db:pull` ya encadena `scripts/fix-bytea.ts`, que parchea esas dos
columnas para usar el `customType` de `src/db/custom-types.ts`. Si agregás
columnas `bytea` nuevas, el script las detecta automáticamente por regex.

## Desarrollo local

```bash
cp .env.example .env
# completar DATABASE_URL, JWT_SECRET

bun install
bun run dev   # watch mode, puerto 5002
```

Requiere que `base-datos` esté corriendo y accesible (ver `../base-datos/README.md`).
Para desarrollo fuera de contenedor, `DATABASE_URL` debe apuntar a `127.0.0.1:5432`
(no a `rebusque-db`, que solo resuelve dentro de la red Podman).

## Contenedor

```bash
bun run deploy   # build + --force-recreate + espera healthcheck (ver scripts/deploy.sh)
podman-compose logs -f backend
curl http://127.0.0.1:5002/health
```

**No uses `podman-compose up -d --build` a secas**: reconstruye la imagen pero
no recrea el contenedor si compose no detecta cambios en `docker-compose.yml`
— el contenedor viejo sigue sirviendo código stale. `bun run deploy` ya
incluye `--force-recreate`.

`DATABASE_URL` en `.env` (el que usa el contenedor) debe apuntar a `rebusque-db:5432`
(nombre del contenedor de Postgres, resuelto vía DNS de la red `rebusque-net`).

## Autenticación: tokens opacos, no JWT

Decisión deliberada: el esquema (`sesiones.revoked_at`, `password_reset_tokens.used_at`)
ya modela revocación server-side explícita. Un JWT autocontenido no se puede revocar
antes de expirar sin mantener una denylist paralela — que terminaría siendo la misma
tabla `sesiones` con otro nombre. En vez de eso: token aleatorio de 32 bytes, se
guarda su hash SHA-256 en `sesiones.token`, el valor crudo solo lo ve el cliente una
vez (en la respuesta del login). Cada request autenticado hashea el Bearer token y
lo busca en `sesiones` (no revocada, no expirada).

## Bootstrap (primer administrador)

`usuarios` arranca vacía — no hay endpoint HTTP para crear el primer admin (sería
un agujero de seguridad). Correr una vez:

```bash
podman exec -e SEED_ADMIN_RUT="11111111-1" \
  -e SEED_ADMIN_EMAIL="admin@elrebusque.cl" \
  -e SEED_ADMIN_PASSWORD="algo-seguro" \
  rebusque-backend bun run scripts/seed-admin.ts
```

Es idempotente: si ya existe algún administrador, no hace nada.

## Endpoints actuales

- `GET /health` — status del servicio + conectividad a Postgres
- `POST /auth/login` — `{ rut, password, deviceIdentifier?, fcmToken? }`. Rechaza
  login de `cliente` (403, no-MVP). Para conductor/ejecutivo/administrador exige
  `deviceIdentifier`; si cambia respecto al dispositivo registrado, revoca la
  sesión anterior, registra el reemplazo en `dispositivos_historial` y deja un
  registro en `notificaciones_log` para cada administrador activo (el envío real
  de correo/push es post-MVP, todavía no existe el worker que lo procese).
- `POST /auth/logout` — revoca la sesión del token actual. Requiere `Authorization: Bearer <token>`.
- `GET /auth/me` — usuario autenticado actual.
- `PATCH /auth/email` — `{ currentPassword, newEmail }`. Cambia el propio correo,
  cualquier rol, requiere confirmar la contraseña actual. Efecto inmediato,
  sin correo de confirmación.
- `GET /usuarios?rol=` — lista usuarios (sin `passwordHash`). `administrador`/`ejecutivo`.
  Filtro opcional por rol (ej. `?rol=conductor` para poblar selectores de asignación).
- `POST /usuarios` — crea usuario. Requiere rol `administrador` (cualquier rol
  destino) o `ejecutivo` (solo puede crear `cliente`); cualquier otro caso, 403.
- `POST /usuarios/:id/forzar-reset-password` — solo `administrador`. `{ newPassword }`.
  Acción administrativa directa (no pasa por correo — eso es la recuperación
  autoservicio, todavía no implementada). Revoca todas las sesiones activas
  del usuario afectado.
- `PATCH /usuarios/:id/email` — solo `administrador`. `{ newEmail }`. Cambia el
  correo de cualquier otro usuario sin pedirle su contraseña.
- `GET /ws?token=` — WebSocket real de sincronización (ver sección propia mas abajo).
- `GET /encomiendas/resumen-diario` — solo `conductor` (403 para otros roles).
  Siempre resume al conductor autenticado, sin parámetro. `asignadasHoy` /
  `entregadasHoy` cuentan eventos de `encomienda_estado_historial` (no
  encomiendas distintas) dentro del día calendario en `America/Santiago`
  (`src/lib/timezone.ts`, sin libreria de fechas); `pendientes` es el conteo
  actual (sin filtro de fecha) en estados `asignada`/`en_ruta`/`retirado`/`en_reparto`.
  Detalle completo en `resumenDiarioConductor` (`encomiendas.service.ts`) y en
  el vault `backend.md`.

## Encomiendas

Máquina de estados completa (`src/modules/encomiendas/`), probada end-to-end contra
el contenedor real (rama con retiro, rama sin retiro, 3 fallas → finalización
automática, cancelación, consulta pública).

- `POST /encomiendas` — crea (ejecutivo/administrador). Auto-crea la cuenta
  `cliente` remitente si el RUT no existe (`remitenteEmail` opcional; si no se
  pasa, placeholder `sin-correo+<rut>@elrebusque.cl` — login de cliente es
  post-MVP, no importa que no sea un correo real todavía).
- `GET /encomiendas`, `GET /encomiendas/:id` — listado/detalle. `conductor`
  solo ve las suyas; `ejecutivo`/`administrador` ven todo.
- `GET /encomiendas/qr/:codigoQr` — resuelve una etiqueta escaneada al detalle
  de la encomienda. Requiere autenticación y aplica la misma visibilidad que el
  listado; no expone encomiendas ajenas a un conductor.
- `POST /encomiendas/:id/asignar` — asigna conductor. Si la encomienda
  requiere retiro (`direccionRetiro` no nula) y viene de `procesando`, salta
  automáticamente a `en_ruta`. Si viene de `en_sucursal` (reintento post-falla
  o post-retiro-no-mismo-día), se queda en `asignada`.
- `POST /encomiendas/:id/recoger` — confirmación tras escaneo QR, `en_ruta` → `retirado`.
- `POST /encomiendas/:id/decidir-post-retiro` — `{ decision: "mismo_dia" | "sucursal" }`,
  manual (ejecutivo/administrador), `retirado` → `en_reparto` | `en_sucursal`.
- `POST /encomiendas/:id/cargar` — confirmación tras escaneo QR, (`asignada`|`en_sucursal`) → `en_reparto`.
- `POST /encomiendas/:id/entregar` — confirmación tras escaneo QR, `en_reparto` → `entregada`,
  `fotoEntregaBase64` opcional (se decodifica y guarda como `bytea`).
- `POST /encomiendas/:id/reportar-fallida` — `en_reparto` → `en_sucursal`, o
  `finalizada` automática (`cambiado_por = NULL`) al tercer intento fallido.
- `POST /encomiendas/:id/cancelar` — manual, cualquier estado no terminal → `finalizada`.
- `PATCH /encomiendas/:id/pago` — cambia `estadoPago`.
- `GET /encomiendas/seguimiento/:numeroSeguimiento` — **público, sin auth**.
  Devuelve *solo* `numeroSeguimiento`, `estado` e historial (`estado` + `fecha`).
  Nunca tocar esa query para agregar columnas sin revisar los comentarios
  `PRIVADO` en `base-datos/esquema.sql`.
- `GET /encomiendas/:id/foto-entrega` — binario real (`image/jpeg`) de la foto
  de entrega, 404 si no hay. El detalle/listado nunca incluyen el `bytea`
  inline (serializaría como `{type:"Buffer",data:[...]}`); exponen
  `tieneFotoEntrega: boolean` en su lugar.

Autorización de acciones de conductor (`recoger`/`cargar`/`entregar`/`reportar-fallida`):
el `conductor` debe ser el `conductorAsignadoId` de la encomienda; `administrador`
puede operar como conductor sin restricción (emergencias, ver app-expo.md).

`numeroSeguimiento` y `codigoQr` se generan aleatorios (`src/lib/ids.ts`), no
secuenciales — el algoritmo no estaba definido en el vault; se eligió así para
que el número público no sea adivinable/enumerable.

## Sucursales y turnos

Administración exclusiva de `administrador` (crear/editar/eliminar); lectura
abierta a cualquier usuario autenticado (ejecutivo la necesita para registrar
encomiendas, conductor para ver contexto).

- `POST /sucursales`, `PATCH /sucursales/:id` (admin) — `GET /sucursales`, `GET /sucursales/:id` (cualquiera).
  Sin `DELETE`: se desactiva con `PATCH { activa: false }` (soft-delete, hay
  encomiendas con FK a sucursal).
- `POST /turnos`, `PATCH /turnos/:id`, `DELETE /turnos/:id` (admin) — `GET /turnos`,
  `GET /turnos/:id` (cualquiera; `conductor` solo ve los suyos, sin importar el filtro).
  Valida que `conductorId` sea un conductor activo, `sucursalId` una sucursal activa,
  y que `horaFin > horaInicio` (con mensaje de error claro, no el error crudo de Postgres).

## WebSocket real

`GET /ws?token=<token-de-sesion>` (el token de `/auth/login`, va en query string
porque el handshake de WS del navegador no permite headers custom). Handshake
se rechaza con 401 si falta o es inválido el token.

Cada transición de estado de una encomienda (crear, asignar, recoger,
decidir-post-retiro, cargar, entregar, reportar-fallida, cancelar) dispara un
broadcast `{ type: "encomienda_actualizada", data: { id, numeroSeguimiento,
estado, conductorAsignadoId } }` a las conexiones que puedan verla: misma
regla de visibilidad que `GET /encomiendas` (administrador/ejecutivo ven todo,
conductor solo lo suyo). Registro de conexiones en memoria
(`src/realtime/broadcaster.ts`) — funciona para un solo proceso backend; si
se escala horizontalmente hay que moverlo a un pub/sub externo (Redis, etc.).

## Pendiente (ver vault `RebusqueAPP/backend/backend.md` para detalle funcional completo)

- **Recuperación de contraseña autoservicio por correo** — deliberadamente diferido
  (requiere decidir proveedor SMTP y plantillas, ver nota en backend.md del vault).
  La tabla `password_reset_tokens` ya existe en el esquema, sin usar todavía.
- Notificaciones (envío real correo + FCM) y seguimiento en tiempo real de conductores — post-MVP
