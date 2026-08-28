#!/bin/bash
# Backup diario de Admira Trace a Google Drive (rclone) con rotación
# diaria/semanal/mensual de la BD y copia off-site de fotos + credenciales.
#
# Corre como cron en el HOST del VPS (no dentro del contenedor Docker), ver
# backup/README.md para la instalación completa. NO commitear este fichero
# con las rutas/valores reales ya rellenados si difieren de lo aquí puesto
# — solo son ejemplo, cada VPS puede tener nombres de volumen distintos.
set -euo pipefail

# ====================== CONFIGURAR ANTES DEL PRIMER USO ======================
APP_DIR=~/admira-trace                    # repo de la app en el VPS
DB_VOLUME=admira-trace_admira-db          # confirmado con `docker volume ls` (2026-08-28)
HOST_UPLOADS_DIR=/data/uploads            # confirmado con `docker inspect admira-trace` (bind mount, mismo path en host y contenedor)
HOST_SECRETO_DIR=/data/secreto            # bind mount nuevo para /data/secreto (añadir a docker-compose.yml + SECRETO_DIR en .env.production)
STAGING_DIR=~/admira-trace-backup/staging
REMOTE="gdrive:Admira Trace - Backups"    # remoto rclone ya configurado (ver README.md)
GPG_RECIPIENT="admira-trace-backup"       # UID/email de la clave pública GPG importada en el VPS
IMAGE_TAG=admira-backup-runner
# ===============================================================================

FECHA=$(date +%F)                              # hoy: nombre del snapshot de BD
FECHA_FOTOS=$(date -d "yesterday" +%F)          # ayer: día ya cerrado del todo, para las fotos
DIA_SEMANA=$(date +%u)                          # 1=lunes ... 7=domingo
DIA_SIGUIENTE=$(date -d "$FECHA +1 day" +%d)    # si mañana es "01", hoy es el último día del mes

echo "[backup] $(date): iniciando backup diario…"
rm -rf "$STAGING_DIR"
mkdir -p "$STAGING_DIR"

echo "[backup] Construyendo imagen builder (usa la caché de Docker, rápido)…"
docker build --target builder -t "$IMAGE_TAG" "$APP_DIR"

echo "[backup] Generando snapshot de BD ($FECHA) y organizando fotos de $FECHA_FOTOS…"
docker run --rm \
  -v "$DB_VOLUME":/data \
  -v "$HOST_UPLOADS_DIR":/data-uploads:ro \
  -v "$STAGING_DIR":/staging \
  -e DATABASE_URL="file:/data/admira-trace.db" \
  -e UPLOADS_DIR=/data-uploads \
  "$IMAGE_TAG" sh -c "
    npx tsx scripts/backup-db-snapshot.ts /staging/db-$FECHA.db &&
    npx tsx scripts/backup-fotos-diario.ts $FECHA_FOTOS /staging/fotos
  "
docker rmi "$IMAGE_TAG" >/dev/null 2>&1 || true

# --- 1. Base de datos: snapshot diario + rotación semanal/mensual ---
gzip -f "$STAGING_DIR/db-$FECHA.db"
rclone copy "$STAGING_DIR/db-$FECHA.db.gz" "$REMOTE/Backups sistema/Diarias/"
echo "[backup] BD diaria subida: db-$FECHA.db.gz"

if [ "$DIA_SEMANA" = "7" ]; then
  echo "[backup] Domingo: consolidando la semana en Semanales/ y limpiando Diarias/ de esta semana…"
  SEMANA=$(date +%G-W%V)
  rclone copyto "$STAGING_DIR/db-$FECHA.db.gz" "$REMOTE/Backups sistema/Semanales/admira-trace-semana-$SEMANA.db.gz"
  INICIO_SEMANA=$(date -d "monday this week" +%F)
  for i in 0 1 2 3 4 5 6; do
    D=$(date -d "$INICIO_SEMANA +$i day" +%F)
    rclone delete "$REMOTE/Backups sistema/Diarias/db-$D.db.gz" 2>/dev/null || true
  done
fi

if [ "$DIA_SIGUIENTE" = "01" ]; then
  echo "[backup] Último día del mes: consolidando en Mensuales/ y limpiando Semanales/ de este mes…"
  MES=$(date +%Y-%m)
  rclone copyto "$STAGING_DIR/db-$FECHA.db.gz" "$REMOTE/Backups sistema/Mensuales/admira-trace-$MES.db.gz"
  PRIMER_DIA_MES="$MES-01"
  d="$PRIMER_DIA_MES"
  declare -A SEMANAS_BORRADAS
  while [ "$(date -d "$d" +%Y-%m)" = "$MES" ]; do
    TAG=$(date -d "$d" +%G-W%V)
    if [ -z "${SEMANAS_BORRADAS[$TAG]:-}" ]; then
      SEMANAS_BORRADAS[$TAG]=1
      rclone delete "$REMOTE/Backups sistema/Semanales/admira-trace-semana-$TAG.db.gz" 2>/dev/null || true
    fi
    d=$(date -d "$d +1 day" +%F)
  done
fi

# --- 2. Fotos del día (ya organizadas Mes/Semana/Día/Incidencia por el script tsx) ---
if [ -d "$STAGING_DIR/fotos" ]; then
  rclone copy "$STAGING_DIR/fotos" "$REMOTE/Fotos mensuales/"
  echo "[backup] Fotos de $FECHA_FOTOS subidas."
fi

# --- 3. Secreto: vault cifrado con GPG (se sobrescribe; Drive guarda versiones previas) ---
if [ -f "$HOST_SECRETO_DIR/credenciales-vault.tsv" ]; then
  gpg --yes --trust-model always --encrypt --recipient "$GPG_RECIPIENT" \
    --output "$STAGING_DIR/credenciales-vault.tsv.gpg" \
    "$HOST_SECRETO_DIR/credenciales-vault.tsv"
  rclone copyto "$STAGING_DIR/credenciales-vault.tsv.gpg" "$REMOTE/Secreto/credenciales-vault.tsv.gpg"
  echo "[backup] Vault de credenciales cifrado y subido."
else
  echo "[backup] Aviso: no existe $HOST_SECRETO_DIR/credenciales-vault.tsv todavía (nadie ha creado/cambiado ninguna contraseña aún)."
fi

rm -rf "$STAGING_DIR"
echo "[backup] $(date): completado."
