/**
 * Rellena Material.estancoInstaladoId para el material histórico que ya
 * figura como INSTALADO pero se importó antes de que existiera ese campo
 * (con las importaciones masivas de "STOCK PANTALLAS FASE 5 AGOSTO 2026",
 * ver scripts/importar-stock-material.ts) — ese proceso ya guardaba el
 * código real del estanco en Material.ubicacion (ej. "LORANCA-003"), que
 * coincide exactamente con Estanco.nombre. Aquí solo se cruzan esos dos
 * datos que ya existen, sin volver a tocar ningún Excel.
 *
 * Uso:
 *   npx tsx scripts/backfill-estanco-instalado.ts            # solo informa
 *   DRY_RUN=false npx tsx scripts/backfill-estanco-instalado.ts   # escribe de verdad
 */
import { prisma } from "../src/lib/prisma";

const DRY_RUN = process.env.DRY_RUN !== "false";

async function main() {
  console.log(DRY_RUN ? "=== MODO PRUEBA: no se escribe nada ===" : "=== ESCRIBIENDO DE VERDAD ===");

  const estancos = await prisma.estanco.findMany({ select: { id: true, nombre: true } });
  const estancoPorNombre = new Map(estancos.map((e) => [e.nombre.trim().toUpperCase(), e.id] as const));
  console.log(`Estancos cargados: ${estancoPorNombre.size}`);

  const pendientes = await prisma.material.findMany({
    where: { estado: "INSTALADO", estancoInstaladoId: null, ubicacion: { not: null } },
    select: { id: true, numeroSerie: true, ubicacion: true },
  });
  console.log(`Material instalado pendiente de vincular: ${pendientes.length}`);

  let vinculados = 0;
  const sinCoincidencia: string[] = [];

  for (const m of pendientes) {
    const clave = (m.ubicacion || "").trim().toUpperCase();
    const estancoId = estancoPorNombre.get(clave);
    if (!estancoId) {
      sinCoincidencia.push(`${m.numeroSerie} -> "${m.ubicacion}"`);
      continue;
    }
    vinculados += 1;
    if (!DRY_RUN) {
      await prisma.material.update({ where: { id: m.id }, data: { estancoInstaladoId: estancoId } });
    }
  }

  console.log(`\nVinculados: ${vinculados}`);
  console.log(`Sin coincidencia en el directorio de estancos: ${sinCoincidencia.length}`);
  if (sinCoincidencia.length > 0) {
    console.log("Primeros 20 sin coincidencia (revisar a mano si hace falta):");
    for (const linea of sinCoincidencia.slice(0, 20)) console.log("  ", linea);
  }
  if (DRY_RUN) console.log("\n(Modo prueba — para escribir de verdad: DRY_RUN=false npx tsx scripts/backfill-estanco-instalado.ts)");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
