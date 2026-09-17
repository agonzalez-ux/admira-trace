import { prisma } from "../src/lib/prisma";

/**
 * Comprueba si ya existen filas duplicadas de (envioId, materialId) en
 * EnvioItem antes de aplicar el nuevo @@unique([envioId, materialId]) del
 * schema (ver commit "Corregir hallazgos de la auditoría..."). Si hay
 * duplicados, el próximo arranque del contenedor (que aplica el schema con
 * `prisma db push --accept-data-loss`) fallaría al crear el índice único y
 * el contenedor quedaría en crash-loop — hay que resolverlos a mano antes.
 *
 * Uso (mismo patrón que el resto de scripts puntuales contra producción):
 *   docker build --target builder -t admira-builder-temp .
 *   docker run --rm \
 *     -v admira-trace_admira-db:/data -e DATABASE_URL="file:/data/admira-trace.db" \
 *     admira-builder-temp npx tsx scripts/verificar-duplicados-envioitem.ts
 *   docker rmi admira-builder-temp
 */
async function main() {
  const duplicados = await prisma.$queryRawUnsafe<{ envioId: string; materialId: string; c: number }[]>(
    `SELECT envioId, materialId, COUNT(*) as c FROM EnvioItem GROUP BY envioId, materialId HAVING c > 1`
  );

  if (duplicados.length === 0) {
    console.log("✅ Sin duplicados: se puede desplegar con seguridad.");
    return;
  }

  console.log(`⚠️ Encontrados ${duplicados.length} pares (envioId, materialId) duplicados:`);
  console.log(duplicados);
  console.log(
    "\nHay que borrar/fusionar las filas duplicadas antes de desplegar este commit, o el arranque del contenedor fallará al crear el índice único."
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
