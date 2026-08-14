# Imagen de producción de Admira Trace.
# Sirve para cualquier hosting que acepte Docker (Railway, Render, Fly.io, VPS…).

FROM node:20-slim AS base
# Prisma necesita OpenSSL para su motor de consultas.
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# --- Dependencias -----------------------------------------------------------
FROM base AS deps
COPY package.json package-lock.json* ./
COPY prisma ./prisma
RUN npm ci

# --- Compilación ------------------------------------------------------------
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# DATABASE_URL solo se usa aquí para que `prisma generate` no falle; la real
# llega por variable de entorno en tiempo de ejecución.
ENV DATABASE_URL="file:./build.db"
# En hostings con poca RAM (p. ej. un VPS pequeño), la comprobación de tipos de
# `next build` puede agotar el heap por defecto de Node y morir a mitad de
# build sin generar .next/standalone (con un fallo de OOM que no siempre se ve
# claro en el log). Se le da más margen de heap explícitamente.
ENV NODE_OPTIONS="--max-old-space-size=3072"
RUN npx prisma generate && npm run build

# --- Ejecución --------------------------------------------------------------
FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000
# Las fotos y la base de datos viven en un volumen persistente montado en /data.
ENV UPLOADS_DIR=/data/uploads

RUN mkdir -p /data/uploads

# Servidor autocontenido generado por `output: "standalone"`.
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Prisma (CLI + motor + esquema) para poder aplicar el esquema al arrancar.
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/prisma ./prisma

COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
