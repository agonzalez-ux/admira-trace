# Backup a Google Drive (rclone + GPG)

Sube cada día a un Google Drive personal (`agonzalez@admira.com`) tres cosas:

- **`Secreto/`** — todas las contraseñas en texto plano de cuentas de la app, **cifradas con GPG** (el VPS solo puede cifrar, nunca descifrar — hace falta la clave privada, que solo tiene Aroa).
- **`Fotos mensuales/`** — copia de las fotos de evidencia, organizadas `Mes/Semana/Día/Incidencia`.
- **`Backups sistema/`** — snapshot de la base de datos con rotación `Diarias → Semanales → Mensuales` (al subir la semanal se borran las diarias de esa semana; al subir la mensual se borran las semanales de ese mes).

Todo corre por cron **en el host del VPS** (no dentro del contenedor Docker), reutilizando el patrón ya usado en el proyecto de montar los volúmenes de Docker en un contenedor efímero para tareas puntuales.

## 0. Antes de nada: averiguar los nombres reales de los volúmenes

```bash
docker volume ls
docker inspect <nombre-del-contenedor-de-la-app> | grep -A3 Mounts
```

Anota el nombre del volumen de la BD y la ruta real del host donde está montado `/data/uploads`. Con eso se rellenan las 3 primeras variables de `backup-diario.sh`.

## 1. Instalar rclone y gnupg en el VPS

```bash
sudo apt update && sudo apt install -y rclone gnupg
```

## 2. Autorizar rclone con Google Drive (lo hace Aroa, no Claude)

En tu **propio PC** (con navegador):

```bash
rclone authorize "drive"
```

Se abre tu navegador, inicias sesión con `agonzalez@admira.com`, autorizas, y la terminal imprime un bloque JSON. Cópialo.

En el **VPS**:

```bash
rclone config create gdrive drive scope=drive token='<pega aquí el JSON>'
rclone lsd gdrive:   # debe listar tus carpetas de Drive → confirma que funciona
```

## 3. Clave GPG para cifrar `Secreto/`

Se genera un par de claves nuevo dedicado a esto. La **privada + passphrase** las guarda Aroa en su gestor de contraseñas (nunca tocan el VPS); solo la **pública** se importa en el VPS.

```bash
# En el VPS, importar SOLO la clave pública que te entrego:
gpg --import admira-trace-backup-public.asc
gpg --list-keys   # confirma que aparece "admira-trace-backup"
```

## 4. Crear la estructura de carpetas en Drive

```bash
rclone mkdir "gdrive:Admira Trace - Backups/Secreto"
rclone mkdir "gdrive:Admira Trace - Backups/Fotos mensuales"
rclone mkdir "gdrive:Admira Trace - Backups/Backups sistema/Diarias"
rclone mkdir "gdrive:Admira Trace - Backups/Backups sistema/Semanales"
rclone mkdir "gdrive:Admira Trace - Backups/Backups sistema/Mensuales"
```

## 5. Habilitar la bóveda de contraseñas en la app

1. Añadir al `docker-compose.yml` del VPS un nuevo bind mount para `/data/secreto` (una carpeta nueva del host, ej. `~/admira-secreto:/data/secreto`).
2. Añadir a `.env.production`: `SECRETO_DIR=/data/secreto`.
3. `docker compose up -d --force-recreate` (variable server-only, no hace falta rebuild).

Desde ese momento, cualquier alta de técnico, cambio de contraseña o reseteo escribe en `/data/secreto/credenciales-vault.tsv` (permisos 600) automáticamente — no hace falta tocar nada más.

## 6. Copiar los scripts de backup al VPS

```bash
mkdir -p ~/admira-trace-backup
scp backup/backup-diario.sh <vps>:~/admira-trace-backup/
chmod +x ~/admira-trace-backup/backup-diario.sh
```

Editar las 6 variables de configuración al principio de `backup-diario.sh` con los valores reales del paso 0.

`git pull` en `~/admira-trace` para traer `scripts/backup-db-snapshot.ts` y `scripts/backup-fotos-diario.ts` (ya en el repo de la app, no necesitan copiarse aparte).

## 7. Probar a mano

```bash
~/admira-trace-backup/backup-diario.sh
```

Verificar en Drive: `rclone ls "gdrive:Admira Trace - Backups"` debe mostrar los 3 árboles con contenido de hoy/ayer.

## 8. Instalar el cron

```bash
crontab -e
```

Añadir (03:00 cada noche, hora del servidor):

```
0 3 * * * /home/<usuario>/admira-trace-backup/backup-diario.sh >> /home/<usuario>/admira-trace-backup/backup.log 2>&1
```

## 9. Sembrar `Secreto/` con las cuentas de staff sin contraseña recuperable

`mgalera`, `erincon`, `acamargo`, `jparada`, `admira` y `fdm` se crearon fuera del repo — nunca quedó su contraseña real guardada en ningún sitio. `scripts/resetear-passwords-staff.ts` las resetea y las captura en el vault, pero **es una acción real sobre cuentas de gente del equipo (quedan con "debes cambiar tu contraseña" otra vez)** — solo ejecutar con confirmación explícita:

```bash
docker build --target builder -t admira-builder-temp .
docker run --rm \
  -v <volumen-db>:/data -e DATABASE_URL="file:/data/admira-trace.db" \
  -v ~/admira-secreto:/data-secreto -e SECRETO_DIR=/data-secreto \
  admira-builder-temp npx tsx scripts/resetear-passwords-staff.ts
docker rmi admira-builder-temp
```

Comunicar las contraseñas impresas a cada persona.

## Restaurar un backup

- **Base de datos**: descargar el `.db.gz` de Drive, `gunzip`, y copiarlo dentro del volumen (mismo truco de contenedor efímero: `docker run --rm -v <volumen-db>:/data -v $(pwd):/host alpine cp /host/admira-trace.db /data/admira-trace.db`), reiniciar el contenedor de la app.
- **Fotos**: `rclone copy` la carpeta del día/mes que se necesite de vuelta a `UPLOADS_DIR/incidencias/<id>/`.
- **Contraseñas**: descargar el `.gpg` y descifrarlo con la clave privada (solo la tiene Aroa): `gpg --decrypt credenciales-vault.tsv.gpg > credenciales-vault.tsv`.
