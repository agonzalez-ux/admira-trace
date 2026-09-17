/**
 * Migración one-off: rellena el nuevo campo Material.imei para los routers
 * ya importados desde el Excel de stock, que hasta ahora solo guardaban el
 * IMEI dentro del texto de la descripción ("... IMEI: 356461761388317. ...").
 * No hace falta volver a descargar el Excel: se extrae con una expresión
 * regular de la propia descripción ya guardada.
 *
 * Uso: npx tsx scripts/backfill-imei.ts
 */
import { prisma } from "../src/lib/prisma";

async function main() {
  const candidatos = await prisma.material.findMany({
    where: { imei: null, descripcion: { contains: "IMEI:" } },
    select: { id: true, descripcion: true },
  });

  let actualizados = 0;
  for (const m of candidatos) {
    const match = (m.descripcion || "").match(/IMEI:\s*(\d{6,20})\./);
    if (!match) continue;
    await prisma.material.update({ where: { id: m.id }, data: { imei: match[1] } });
    actualizados++;
  }

  console.log(`Materiales revisados: ${candidatos.length}. IMEI rellenado en: ${actualizados}.`);
}

main()
  .catch((e) => {
    console.error("ERROR:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
