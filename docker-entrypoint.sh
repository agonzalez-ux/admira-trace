#!/bin/sh
set -e

if [ -n "$TURSO_DATABASE_URL" ]; then
  # Con Turso, el esquema se aplica a mano una vez (ver scripts/aplicar-migracion-turso.ts),
  # porque la CLI de Prisma no sabe hacer db push/migrate contra una URL libsql://.
  # Además, el datasource del schema exige DATABASE_URL para validarse aunque no
  # se use en tiempo de ejecución (el cliente usa el driver adapter de Turso).
  echo "[arranque] Usando Turso: se omite la sincronización automática del esquema."
else
  # Sin Turso (hosting con disco propio + DATABASE_URL a un fichero local), el
  # esquema sí se puede aplicar solo, y es idempotente: si ya está al día no
  # hace nada, y si es una base nueva la crea con todas las tablas.
  echo "[arranque] Sincronizando el esquema de la base de datos…"
  node node_modules/prisma/build/index.js db push --skip-generate --accept-data-loss
fi

# Next.js en modo standalone escucha en $HOSTNAME si está definida, y Render
# (como otros hostings) la define con el nombre interno del contenedor en vez
# de una dirección real, así que el proxy nunca consigue conectar. Se anula
# aquí para que escuche en todas las interfaces.
unset HOSTNAME

echo "[arranque] Iniciando Admira Trace en el puerto ${PORT}…"
exec node server.js
