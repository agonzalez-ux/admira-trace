# Admira Trace

Gestión de instalaciones, incidencias, material y envíos para los proyectos Altadis que gestiona Admira. Sustituye al Excel/WhatsApp como fuente única de verdad: cada pieza de material, cada incidencia y cada envío queda trazado de principio a fin.

**En producción:** https://admiratrace.ieu.ai

---

## Los 3 portales

Una misma app, tres vistas distintas según el rol de quien entra (login por usuario, no por email):

| Rol | Quién | Qué hace |
|---|---|---|
| **Admira** | Coordinación | Gestiona incidencias, material/stock, envíos, técnicos, y valida las instalaciones nuevas |
| **FDM** | Almacén FDM | Prepara/recibe envíos (escaneo de material), rellena datos de transporte cuando le corresponde |
| **Técnico** | Técnicos de campo | Ve sus incidencias asignadas, su material, confirma envíos/recogidas |

Dentro del portal Admira hay además un **selector de proyecto** (Altadis Península / Blu / Andorra / Canarias / Portugal) que filtra incidencias, material y técnicos según el proyecto activo. Las cuentas de FDM y Técnico no llevan selector — ven todo lo suyo sin filtrar por proyecto.

---

## Funcionalidades

### Incidencias e instalaciones
- Import automático de tickets del **desk** (`api.desk.admira.com`) que requieren visita in situ, sincronización periódica en segundo plano.
- Instalaciones nuevas: se importan de un Excel semanal que sube Altadis (no vienen del desk) — pestaña propia, solo visible en Altadis Península.
- Vinculación automática (best-effort) de cada incidencia con su **estanco** del directorio de comerciales, para poder avisarles por email cuando se programa/empieza una visita.
- Asignación de técnico con **"técnico más cercano"** (distancia en km, geocodificado contra el estanco).
- Evidencia fotográfica al resolver, con limpieza automática mensual (ver [CLEANUP_SYSTEM.md](CLEANUP_SYSTEM.md)).

### Material y stock
- Alta de material por número de serie (con lectura de etiqueta por foto/OCR client-side, sin coste ni API externa).
- Estados: en almacén FDM/Admira, en tránsito, en poder del técnico, instalado, baja.
- Filtrado por proyecto (campo real en el modelo, no inferido).

### Envíos, recogidas y transferencias
- Flujo de escaneo en origen/destino para dejar constancia exacta de qué pieza física se movió.
- **Aviso automático a transportistas**: con Maresa y Rhenus se manda un email automático (asunto en mayúsculas, material, bulto, dimensiones, día/horario de recogida, direcciones) en cuanto se conocen los datos del bulto; con GLS se enlaza directamente a su portal (sin automatizar la petición); "Otro" sin automatizar. Quien tiene el bulto delante (el almacén de origen, o el técnico si es una recogida) es quien rellena esos datos — ver `src/lib/transportistas.ts`.
- Órdenes recurrentes (mismo pedido cada N días, sin tener que recrearlo a mano).

### Técnicos
- Directorio con contacto, zona, cobertura sin coste, material que llevan encima e incidencias pendientes.
- Datos importados de la hoja "New Técnicos" (`scripts/import-tecnicos.ts`).

### Notificaciones
- Campanita en la app (in-app) + **notificaciones push del navegador** (Web Push/VAPID), activables desde cualquier navegador de escritorio o Android sin instalar nada. En iPhone/iPad, Apple exige que la web esté "Añadida a la pantalla de inicio" antes de conceder el permiso — restricción de iOS, no de esta app.
- Emails salientes (recuperación de contraseña, avisos a transportistas, avisos a comerciales) van siempre con `soporte.altadis@admira.com` en copia (`SMTP_CC`), sea cual sea el remitente configurado.

### Integraciones
- **Google Sheets**: sincronización en tiempo real de incidencias/material/envíos/estancos a documentos reales (para quien prefiera seguir mirando un Excel).
- **Desk de tickets**: import + actualización periódica de incidencias con intervención in situ.

### Responsive / móvil
La app funciona igual desde el móvil (no es una app instalable obligatoria, sigue siendo una web normal) — cabecera, formularios y listados se adaptan a pantallas pequeñas.

---

## Stack técnico

- **Next.js 14** (App Router) + **TypeScript**
- **Prisma** + SQLite (`prisma/schema.prisma`)
- **Tailwind CSS**
- Autenticación con JWT en cookie (`jose`), sesiones por rol
- `nodemailer` (SMTP) para email, `web-push` para notificaciones push
- `googleapis` para la sincronización con Sheets
- `tesseract.js` para OCR de números de serie (client-side, gratis)
- `html5-qrcode` para el escáner de códigos de barras
- Despliegue en **Docker** (multi-stage: `base → deps → builder → runner`)

---

## Desarrollo en local

```bash
npm install
npx prisma db push      # crea/actualiza el esquema en dev.db (SQLite local)
npm run db:seed         # usuarios y datos de ejemplo (admira/admira, fdm/fdm, tecnico/tecnico...)
npm run dev
```

Comandos útiles:

```bash
npm run build            # build de producción (incluye chequeo de tipos)
npx tsc --noEmit         # solo chequeo de tipos, más rápido para iterar
npx prisma studio        # explorar la base de datos local con una UI
```

---

## Variables de entorno

Todas están documentadas con comentarios en [.env](.env) (no se sube a git — usa ese archivo como referencia autoritativa de qué hace falta y por qué). Por categorías:

| Categoría | Variables |
|---|---|
| Base de datos | `DATABASE_URL` |
| Auth | `JWT_SECRET`, `APP_BASE_URL` |
| Desk de tickets | `DESK_API_BASE_URL`, `DESK_API_TOKEN` |
| Email (SMTP) | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`, `SMTP_REPLY_TO`, `SMTP_CC` |
| Google Sheets | `GOOGLE_SHEETS_CLIENT_EMAIL`, `GOOGLE_SHEETS_PRIVATE_KEY`, `GOOGLE_SHEETS_*_ID` (uno por documento) |
| Notificaciones push | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_SUBJECT` |
| Transportistas | `MARESA_EMAIL`, `RENUS_EMAIL`, `NEXT_PUBLIC_GLS_PORTAL_URL`, `NEXT_PUBLIC_DIRECCION_ALMACEN_FDM`, `NEXT_PUBLIC_CIUDAD_ALMACEN_FDM`, `NEXT_PUBLIC_DIRECCION_ALMACEN_ADMIRA`, `NEXT_PUBLIC_CIUDAD_ALMACEN_ADMIRA` |
| Varios | `NEXT_PUBLIC_WHATSAPP_PHONE` |
| Solo si se usa la vía gratuita de despliegue (ver más abajo) | `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `CLOUDINARY_*`, `UPLOADS_DIR` |

Los prefijos `NEXT_PUBLIC_` son variables que también se usan en el navegador (se incluyen en el JS que se manda al cliente) — cambiarlas requiere `docker compose build`, no solo reiniciar.

---

## Despliegue

`DESPLIEGUE.md` documenta la vía gratuita (Render + Turso + Cloudinary) como opción sin coste para levantar una instancia propia. **La instancia real en producción** (`admiratrace.ieu.ai`) usa la otra vía descrita ahí mismo: un VPS con Docker + disco propio (SQLite + carpeta de uploads local) detrás de un Cloudflare Tunnel (sin necesitar IP pública ni certificados propios). Ver [DESPLIEGUE.md](DESPLIEGUE.md) para el paso a paso de cualquiera de las dos.

Despliegue de un cambio ya en `main` sobre la instancia real:
```bash
git pull
docker compose build && docker compose up -d
```

---

## Limpieza mensual automática

Las fotos de incidencias resueltas se archivan y limpian automáticamente cada mes para no llenar el disco, con 12 meses de backup para auditoría. Detalles completos en [CLEANUP_SYSTEM.md](CLEANUP_SYSTEM.md).

---

## Scripts de mantenimiento (`scripts/`)

Scripts puntuales para tareas de import/migración/diagnóstico contra la base de datos (local o producción, vía `tsx scripts/nombre.ts`). Los más usados:

- `import-tecnicos.ts` / `import-estancos.ts` — cargan los directorios maestros desde Excel/Sheets.
- `importar-coordenadas-tecnico-cerca.ts` — geocodifica técnicos/estancos para "técnico más cercano".
- `diagnosticar-sync-desk.ts` — depura por qué un ticket del desk no se importó/actualizó.
- `probar-smtp.ts` — comprueba la conexión SMTP sin mandar ningún correo real.
- `backfill-proyecto.ts` — recalcula el proyecto (Península/Blu/...) de incidencias/material existentes.

---

## Próximas mejoras (en diseño)

- **Validación de instalaciones antes de publicarlas**: al subir el Excel semanal, cada instalación nueva quedará "pendiente de validar" (no visible en la pestaña Instalaciones) hasta que el comercial del estanco responda un formulario propio (enlace de un solo uso, sin cuenta) y el equipo de Admira dé el OK manualmente desde una pantalla nueva. Pendiente de las preguntas exactas del formulario.
