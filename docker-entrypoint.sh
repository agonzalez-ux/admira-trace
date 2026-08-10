#!/bin/sh
set -e

# Aplica el esquema a la base de datos antes de arrancar. Es idempotente: si la
# base ya está al día no hace nada, y si es nueva la crea con todas las tablas.
echo "[arranque] Sincronizando el esquema de la base de datos…"
node node_modules/prisma/build/index.js db push --skip-generate --accept-data-loss

echo "[arranque] Iniciando Admira Trace en el puerto ${PORT}…"
exec node server.js
