import fs from "fs/promises";
import path from "path";
import { prisma } from "../src/lib/prisma";
import { UPLOADS_DIR } from "../src/lib/uploads";

/**
 * Prepara en un directorio de staging una copia de las fotos de evidencia
 * subidas en la fecha dada (por defecto, ayer), organizadas
 * Mes/Semana/Día/Incidencia — lista para que `backup/backup-diario.sh` la
 * suba a Drive con `rclone copy`. No borra ni mueve nada del origen: es solo
 * una copia off-site, independiente de la limpieza mensual que ya hace
 * cleanupScheduler.ts dentro del propio VPS.
 *
 * Uso: npx tsx scripts/backup-fotos-diario.ts [YYYY-MM-DD] [directorio-salida]
 */

function numeroYRangoSemanaDelMes(fecha: Date): { numero: number; inicio: Date; fin: Date } {
  const inicioSemana = new Date(fecha);
  inicioSemana.setDate(fecha.getDate() - ((fecha.getDay() + 6) % 7)); // lunes de esa semana
  const finSemana = new Date(inicioSemana);
  finSemana.setDate(inicioSemana.getDate() + 6);

  const inicioMes = new Date(fecha.getFullYear(), fecha.getMonth(), 1);
  const offsetInicioMes = (inicioMes.getDay() + 6) % 7; // días de la semana previa que "cuentan" para el nº de semana
  const numero = Math.ceil((fecha.getDate() + offsetInicioMes) / 7);

  return { numero, inicio: inicioSemana, fin: finSemana };
}

function nombreCarpetaIncidencia(inc: { id: string; ticketExternoId: string | null }): string {
  const base = inc.ticketExternoId ? `INC-${inc.ticketExternoId}` : inc.id;
  return base.replace(/[\\/:*?"<>|]/g, "-");
}

async function main() {
  const fechaArg = process.argv[2];
  const salidaArg = process.argv[3];

  let inicio: Date;
  if (fechaArg) {
    inicio = new Date(`${fechaArg}T00:00:00`);
  } else {
    inicio = new Date();
    inicio.setDate(inicio.getDate() - 1);
    inicio.setHours(0, 0, 0, 0);
  }
  const fin = new Date(inicio);
  fin.setDate(fin.getDate() + 1);

  const fotos = await prisma.fotoEvidencia.findMany({
    where: { fecha: { gte: inicio, lt: fin } },
    include: { incidencia: { select: { id: true, ticketExternoId: true } } },
  });

  const diaTag = inicio.toISOString().slice(0, 10);

  if (fotos.length === 0) {
    console.log(`[backup-fotos] Sin fotos para ${diaTag}.`);
    return;
  }

  const mesTag = `${inicio.getFullYear()}-${String(inicio.getMonth() + 1).padStart(2, "0")}`;
  const { numero, inicio: inicioSemana, fin: finSemana } = numeroYRangoSemanaDelMes(inicio);
  const semanaTag = `Semana ${numero} (${String(inicioSemana.getDate()).padStart(2, "0")}-${String(finSemana.getDate()).padStart(2, "0")})`;

  const destinoBase = salidaArg ? path.resolve(salidaArg) : path.join(process.cwd(), "backup-staging", "fotos");

  let copiadas = 0;
  let saltadas = 0;
  for (const foto of fotos) {
    if (!foto.url.startsWith("/api/uploads/")) {
      // URL de Cloudinary u otro almacenamiento externo: no hay archivo local que copiar.
      saltadas += 1;
      continue;
    }
    const partes = foto.url.split("/");
    const filename = partes[partes.length - 1];
    const origen = path.join(UPLOADS_DIR, "incidencias", foto.incidenciaId, filename);
    const destinoDir = path.join(destinoBase, mesTag, semanaTag, diaTag, nombreCarpetaIncidencia(foto.incidencia));
    try {
      await fs.mkdir(destinoDir, { recursive: true });
      await fs.copyFile(origen, path.join(destinoDir, filename));
      copiadas += 1;
    } catch (err) {
      console.error(`[backup-fotos] No se pudo copiar ${origen}:`, (err as Error).message);
      saltadas += 1;
    }
  }

  console.log(`[backup-fotos] ${diaTag}: ${copiadas} copiadas, ${saltadas} saltadas. Staging: ${destinoBase}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
