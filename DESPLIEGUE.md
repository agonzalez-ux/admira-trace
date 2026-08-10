# Desplegar Admira Trace en `admiratrace.admira.com`

Hay dos vías. Esta guía cubre la **gratuita, sin tarjeta de crédito en ningún
sitio**, que es la recomendada salvo que prefieras pagar por un hosting con
disco propio (ver la vía alternativa al final).

---

## Vía gratuita: Render + Turso + Cloudinary

Ningún hosting gratuito de verdad (sin tarjeta) da disco persistente, así que
la base de datos y las fotos viven en dos servicios externos gratuitos
diseñados para eso, y Render solo ejecuta el código:

| Pieza | Servicio | Variable de entorno |
|---|---|---|
| Servidor Next.js | **Render** (Free Web Service) | — |
| Base de datos | **Turso** (SQLite en la nube) | `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` |
| Fotos de evidencia | **Cloudinary** | `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` |

El código ya está preparado para esto: si esas variables no están puestas seguirá
usando el fichero SQLite y el disco local, tal como en desarrollo.

### 1. Crear las tres cuentas (ninguna pide tarjeta)

- [turso.tech](https://turso.tech) → crear base de datos `admira-trace` → copiar su **Database URL** (`libsql://...`) y crear un **Auth Token**.
- [cloudinary.com](https://cloudinary.com) → del Dashboard copiar **Cloud name**, **API Key** y **API Secret**.
- [render.com](https://render.com) → registrarse, preferiblemente con GitHub.

### 2. Subir el esquema de la base de datos a Turso

Prisma no puede aplicar el esquema directamente sobre Turso (limitación conocida:
no soporta `db push`/`migrate` contra una URL `libsql://`). Por eso el esquema ya
está exportado como SQL en `prisma/migrations/0001_init/migration.sql`. Con la
CLI de Turso instalada (`curl -sSfL https://get.tur.so/install.sh | bash`):

```bash
turso db shell admira-trace < prisma/migrations/0001_init/migration.sql
```

Esto crea todas las tablas en la base de Turso, vacías, en un solo paso.

> Si en el futuro cambiamos el `schema.prisma`, hay que generar una migración
> nueva (`npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/000X_nombre/migration.sql`)
> y aplicarla igual con `turso db shell`.

### 3. Subir el proyecto a GitHub

Render despliega desde un repositorio. Si el proyecto aún no es un repo git:

```bash
git init
git add .
git commit -m "Primera versión de Admira Trace"
```

Crea un repositorio privado en [github.com/new](https://github.com/new) y sigue
las instrucciones de `git remote add origin ...` que te da GitHub.

### 4. Crear el servicio en Render

1. **New → Web Service** → conecta el repositorio.
2. Runtime: **Docker** (detecta el `Dockerfile` solo).
3. Plan: **Free**.
4. **Environment → Add Environment Variable** y añade:

```
TURSO_DATABASE_URL=libsql://admira-trace-xxxx.turso.io
TURSO_AUTH_TOKEN=<el token de Turso>
CLOUDINARY_CLOUD_NAME=<tu cloud name>
CLOUDINARY_API_KEY=<tu api key>
CLOUDINARY_API_SECRET=<tu api secret>
APP_BASE_URL=https://admiratrace.admira.com
JWT_SECRET=<genera uno nuevo, no reutilices el de local>
NEXT_PUBLIC_WHATSAPP_PHONE=...
DESK_API_BASE_URL=http://api.desk.admira.com/api
DESK_API_TOKEN=481
SMTP_HOST=smtp-relay.gmail.com
SMTP_PORT=587
SMTP_FROM=Admira Trace <soporte.altadis@admira.com>
SMTP_REPLY_TO=soporte.altadis@admira.com
GOOGLE_SHEETS_CLIENT_EMAIL=...
GOOGLE_SHEETS_PRIVATE_KEY=...
GOOGLE_SHEETS_SPREADSHEET_ID=...
GOOGLE_SHEETS_STOCK_ID=...
GOOGLE_SHEETS_INFORME_ID=...
GOOGLE_SHEETS_INTERVENCIONES_ID=...
GOOGLE_SHEETS_CENSO_ID=...
GOOGLE_SHEETS_ESTANCOS_ID=...
```

No hace falta poner `DATABASE_URL` ni `UPLOADS_DIR`: al detectar las variables
de Turso y Cloudinary, la app las usa automáticamente en su lugar.

Genera el `JWT_SECRET` con:
```bash
openssl rand -base64 48
```

5. **Create Web Service**. Render construye la imagen Docker y arranca.

### 5. Comprobar que arrancó

En la pestaña **Logs** de Render debería verse:
```
[arranque] Sincronizando el esquema de la base de datos…
[arranque] Iniciando Admira Trace en el puerto 3000…
```
Render da una URL temporal (`admira-trace.onrender.com`); pruébala antes de
tocar el dominio.

> ⚠️ El plan gratuito de Render "duerme" el servicio tras 15 minutos sin
> tráfico: la primera visita tras la inactividad tarda ~30s en responder
> mientras arranca. Es normal, no es un fallo.

### 6. Cargar los datos reales

Desde tu equipo, apuntando a Turso (usa las mismas variables `TURSO_DATABASE_URL`
y `TURSO_AUTH_TOKEN` en tu `.env` local temporalmente, o pásalas inline):

```bash
TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... npx tsx scripts/import-estancos.ts "<ruta al Excel>"
TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... npx tsx scripts/import-tecnicos.ts
```

### 7. Conectar el dominio en Cloudflare

1. En Render: **Settings → Custom Domain** → añade `admiratrace.admira.com`. Te
   dará un valor CNAME.
2. En **Cloudflare** (zona `admira.com`) → **DNS → Add record**:
   - Tipo: `CNAME`
   - Nombre: `admiratrace`
   - Destino: el valor que te dio Render
   - Proxy: **activado** (nube naranja)
3. **SSL/TLS → Overview** → modo **Full (strict)**.

Propaga en pocos minutos. A partir de ahí, `https://admiratrace.admira.com`
sirve la app.

---

## Vía alternativa (de pago): hosting con disco propio

Si en el futuro se prefiere evitar el "sueño" de Render gratis o simplificar
(una sola base de datos local en vez de Turso+Cloudinary), cualquier hosting
que acepte Docker y dé un volumen persistente sirve tal cual, sin usar Turso
ni Cloudinary — solo hay que **no** definir `TURSO_DATABASE_URL` ni
`CLOUDINARY_CLOUD_NAME`, y sí definir:

```
DATABASE_URL=file:/data/admira-trace.db
UPLOADS_DIR=/data/uploads
```

con un volumen montado en `/data`. Opciones habituales: Railway, Render (plan
de pago con Disk), Fly.io, o un VPS propio. El resto de pasos (dominio en
Cloudflare, variables de SMTP/Sheets/desk) son los mismos.

---

## Comprobaciones después del primer despliegue

- [ ] Entrar y hacer login con los tres roles.
- [ ] Dar de alta un material y verlo en el listado.
- [ ] Abrir Incidencias (debe sincronizar con el desk).
- [ ] Subir una foto de evidencia y volver a abrirla (verifica Cloudinary).
- [ ] Esperar a que Render "duerma" el servicio y volver a entrar (verifica que los datos siguen ahí, en Turso).
- [ ] Probar "he olvidado mi contraseña" cuando el relay SMTP esté activo.

---

## Notas

- **Escáner de códigos de barras**: la cámara solo funciona en HTTPS. Con
  Cloudflare delante ya lo tienes, pero en local seguirá pidiendo `localhost`.
- **Órdenes recurrentes**: se comprueban cada hora mientras el servidor esté
  despierto. Con Render gratis, si el servicio lleva más de 15 min dormido,
  esa comprobación no corre hasta que alguien visite la web. Para forzarla
  igualmente se puede llamar externamente a `POST /api/ordenes-recurrentes/ejecutar`
  con un servicio gratuito de "ping" periódico (p. ej. cron-job.org).
- **Copias de seguridad de Turso**: `turso db dump admira-trace > backup.sql`
  desde tu equipo, cuando quieras.
