/**
 * Migración one-off: pasa a la nueva categoría "PC" el material que se
 * importó como "Otro" (tipoPersonalizado = "PC") antes de que "PC" existiera
 * como tipo propio en TIPOS_MATERIAL. No afecta a nada más (tablets u otros
 * "Otro" con tipoPersonalizado distinto de "PC" se quedan igual).
 *
 * Uso: npx tsx scripts/migrar-otro-a-pc.ts
 */
import { prisma } from "../src/lib/prisma";

async function main() {
  const res = await prisma.material.updateMany({
    where: { tipo: "OTRO", tipoPersonalizado: "PC" },
    data: { tipo: "PC", tipoPersonalizado: null },
  });
  console.log(`Materiales pasados de "Otro" a "PC": ${res.count}`);
}

main()
  .catch((e) => {
    console.error("ERROR:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
