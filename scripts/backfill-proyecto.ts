/**
 * Migración one-off: rellena el nuevo campo `proyecto` (Altadis Península /
 * Blu / Andorra / Canarias / Portugal) en las Incidencia y Material ya
 * existentes, a partir de los datos que ya tenían guardados:
 *
 *   - Incidencia: se deriva de `deskProyecto` (proyectoDesdeDesk). Las
 *     incidencias de origen "HARDWARE" (monitorización de pantallas) y
 *     "MANUAL" sin deskProyecto se marcan como PENINSULA — son siempre de
 *     la red doméstica española (ver comentarios en hardwareSync.ts /
 *     importar-instalaciones/route.ts).
 *   - Material: se deriva del texto "Proyecto: X." que ya llevaba la
 *     descripción de cada unidad importada del Excel de stock
 *     (proyectoDesdeTextoMaterial) — "Myblu" → BLU, el resto → PENINSULA
 *     (confirmado revisando los estancos reales de cada etiqueta, ver
 *     commit de esta migración). El material sin esa etiqueta en la
 *     descripción se deja sin proyecto para revisión manual.
 *
 * Uso: npx tsx scripts/backfill-proyecto.ts
 */
import { prisma } from "../src/lib/prisma";
import { proyectoDesdeDesk, proyectoDesdeTextoMaterial } from "../src/lib/proyectos";

async function backfillIncidencias() {
  const incidencias = await prisma.incidencia.findMany({
    where: { proyecto: null },
    select: { id: true, origen: true, deskProyecto: true },
  });

  let porDesk = 0;
  let porDefecto = 0;
  let sinResolver = 0;

  for (const inc of incidencias) {
    let proyecto = proyectoDesdeDesk(inc.deskProyecto);
    if (proyecto) {
      porDesk++;
    } else if (inc.origen === "HARDWARE" || inc.origen === "MANUAL") {
      proyecto = "PENINSULA";
      porDefecto++;
    } else {
      sinResolver++;
      continue;
    }
    await prisma.incidencia.update({ where: { id: inc.id }, data: { proyecto } });
  }

  console.log(
    `Incidencias: ${incidencias.length} revisadas — ${porDesk} por deskProyecto, ${porDefecto} por defecto (HARDWARE/MANUAL), ${sinResolver} sin resolver (quedan sin proyecto).`
  );
}

async function backfillMaterial() {
  const materiales = await prisma.material.findMany({
    where: { proyecto: null },
    select: { id: true, descripcion: true },
  });

  let actualizados = 0;
  let sinEtiqueta = 0;

  for (const m of materiales) {
    const match = (m.descripcion || "").match(/Proyecto:\s*([^.]+)\./);
    if (!match) {
      sinEtiqueta++;
      continue;
    }
    const proyecto = proyectoDesdeTextoMaterial(match[1]);
    await prisma.material.update({ where: { id: m.id }, data: { proyecto } });
    actualizados++;
  }

  console.log(`Material: ${materiales.length} revisados — ${actualizados} actualizados, ${sinEtiqueta} sin etiqueta de proyecto en la descripción (quedan sin proyecto).`);
}

async function main() {
  await backfillIncidencias();
  await backfillMaterial();
}

main()
  .catch((e) => {
    console.error("ERROR:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
