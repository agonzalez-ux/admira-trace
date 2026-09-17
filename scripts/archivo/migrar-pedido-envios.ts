/**
 * Migración one-off para el rediseño de envíos (tipos de movimiento unificados
 * + pedido por categoría). El nuevo schema añade `Envio.pedido` como columna
 * OBLIGATORIA sin valor por defecto — si se despliega tal cual con envíos ya
 * existentes en la base de datos, `prisma db push --accept-data-loss` (que
 * corre automáticamente en cada arranque del contenedor) fallará, igual que
 * pasó en local con la migración de número de serie.
 *
 * Este script debe correrse ANTES de desplegar el nuevo build, usando SQL
 * crudo (no el cliente tipado) porque el propio `schema.prisma` de este
 * commit ya no es compatible con la base de datos vieja hasta que esto se
 * ejecute — mismo patrón que scripts/migrar-a-numero-serie.ts.
 *
 * Qué hace:
 * 1. Si la columna "pedido" no existe todavía en "Envio", la añade (TEXT,
 *    nullable de momento).
 * 2. Para cada envío sin pedido, lo reconstruye a partir de los EnvioItem
 *    que ya tenga enlazados (agrupando por tipo de material) — si no tiene
 *    ninguno, le pone un pedido vacío "[]" en vez de dejarlo en null.
 *
 * Uso en producción (uno-off contra el volumen real, sin tocar el contenedor
 * en marcha):
 *   docker build --target builder -t admira-builder-temp .
 *   docker run --rm -v admira-trace_admira-db:/data -e DATABASE_URL="file:/data/admira-trace.db" admira-builder-temp npx tsx scripts/migrar-pedido-envios.ts
 *   docker rmi admira-builder-temp
 *
 * Solo después de que esto termine sin errores se debe hacer `git pull` +
 * `docker compose build` + `docker compose up -d` con el nuevo código.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const columnas = (await prisma.$queryRawUnsafe(`PRAGMA table_info("Envio")`)) as { name: string }[];
  const tieneColumnaPedido = columnas.some((c) => c.name === "pedido");

  if (!tieneColumnaPedido) {
    console.log('Añadiendo columna "pedido" a "Envio"...');
    await prisma.$executeRawUnsafe(`ALTER TABLE "Envio" ADD COLUMN "pedido" TEXT`);
  } else {
    console.log('La columna "pedido" ya existe, se salta el ALTER TABLE.');
  }

  const envios = (await prisma.$queryRawUnsafe(
    `SELECT "id" FROM "Envio" WHERE "pedido" IS NULL OR "pedido" = ''`
  )) as { id: string }[];

  console.log(`Envíos sin pedido a rellenar: ${envios.length}`);

  let reconstruidosDesdeItems = 0;
  let vacios = 0;

  for (const envio of envios) {
    const items = (await prisma.$queryRawUnsafe(
      `SELECT m."tipo" as tipo
       FROM "EnvioItem" ei
       JOIN "Material" m ON m."id" = ei."materialId"
       WHERE ei."envioId" = ?`,
      envio.id
    )) as { tipo: string }[];

    let pedido: { tipo: string; cantidad: number }[];
    if (items.length > 0) {
      const conteo = new Map<string, number>();
      for (const i of items) conteo.set(i.tipo, (conteo.get(i.tipo) || 0) + 1);
      pedido = Array.from(conteo.entries()).map(([tipo, cantidad]) => ({ tipo, cantidad }));
      reconstruidosDesdeItems += 1;
    } else {
      pedido = [];
      vacios += 1;
    }

    await prisma.$executeRawUnsafe(`UPDATE "Envio" SET "pedido" = ? WHERE "id" = ?`, JSON.stringify(pedido), envio.id);
  }

  console.log(`Reconstruidos a partir de sus materiales enlazados: ${reconstruidosDesdeItems}`);
  console.log(`Dejados con pedido vacío (sin materiales enlazados): ${vacios}`);
  console.log("Migración completada.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
