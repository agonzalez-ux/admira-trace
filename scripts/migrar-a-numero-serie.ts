/**
 * Migración de datos: el número de serie pasa a ser el identificador único
 * de Material (antes lo era el código de barras). Este script debe correr
 * ANTES de desplegar el nuevo esquema (que elimina la columna codigoBarras),
 * porque una vez desplegado, `prisma db push --accept-data-loss` borra esa
 * columna sin preguntar.
 *
 * Regla: si el material ya tiene numeroSerie (p. ej. capturado por OCR), se
 * respeta tal cual. Si no lo tiene, se rellena con el código de barras actual
 * (que ya era único), para que ningún material se quede sin identificador.
 */
import { prisma } from "../src/lib/prisma";

async function main() {
  const materiales = await prisma.material.findMany({
    select: { id: true, codigoBarras: true, numeroSerie: true },
  });

  let rellenados = 0;
  let yaTenian = 0;

  for (const m of materiales) {
    if (m.numeroSerie && m.numeroSerie.trim()) {
      yaTenian++;
      continue;
    }
    await prisma.material.update({
      where: { id: m.id },
      data: { numeroSerie: m.codigoBarras },
    });
    rellenados++;
  }

  console.log(`Materiales con número de serie ya capturado: ${yaTenian}`);
  console.log(`Materiales rellenados desde el código de barras: ${rellenados}`);

  // Comprobación de seguridad: si hubiera duplicados, la siguiente migración
  // de esquema (numeroSerie @unique) fallaría — mejor saberlo ahora.
  const todos = await prisma.material.findMany({ select: { numeroSerie: true } });
  const conteo = new Map<string, number>();
  for (const m of todos) {
    const v = m.numeroSerie || "";
    conteo.set(v, (conteo.get(v) || 0) + 1);
  }
  const duplicados = [...conteo.entries()].filter(([, c]) => c > 1);
  if (duplicados.length > 0) {
    console.error("⚠️  ATENCIÓN: números de serie duplicados tras la migración:", duplicados);
    process.exit(1);
  } else {
    console.log("✅ Sin duplicados: seguro aplicar numeroSerie como campo único.");
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
