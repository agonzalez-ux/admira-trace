import { prisma } from "../src/lib/prisma";
import { syncToSheets } from "../src/lib/googleSheets";

/**
 * Borra la instalación y el estanco de prueba creados por
 * crear-demo-formulario-viabilidad.ts, y actualiza el Censo/Informe en
 * Sheets para que tampoco quede rastro ahí.
 *
 * Uso: mismo patrón que crear-demo-formulario-viabilidad.ts.
 */
async function main() {
  const incidencias = await prisma.incidencia.findMany({
    where: { titulo: { contains: "PRUEBA — Pantalla LG 55" } },
  });

  for (const inc of incidencias) {
    await prisma.viabilidadToken.deleteMany({ where: { incidenciaId: inc.id } });
    await prisma.viabilidadRespuesta.deleteMany({ where: { incidenciaId: inc.id } });
    await prisma.viabilidadFoto.deleteMany({ where: { incidenciaId: inc.id } });
    await prisma.incidencia.delete({ where: { id: inc.id } });
    console.log(`Borrada incidencia de prueba: ${inc.id}`);
  }

  const estanco = await prisma.estanco.findUnique({ where: { idEstanco: "PRUEBA-FORMULARIO-VIABILIDAD" } });
  if (estanco) {
    await prisma.estanco.delete({ where: { id: estanco.id } });
    console.log("Borrado estanco de prueba.");
  }

  await syncToSheets(["incidencias", "censo"]).catch((e) => console.warn("Aviso: no se pudo sincronizar Sheets:", e));

  console.log("Limpieza de la demo completada.");
}

main().finally(() => prisma.$disconnect());
