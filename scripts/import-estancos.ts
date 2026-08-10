/**
 * Importa el directorio maestro de estancos desde el Excel real
 * "Universo Comerciales" (hoja "BBDD ESTANCOS") a la tabla Estanco.
 *
 * Uso: npx tsx scripts/import-estancos.ts "<ruta al xlsx>"
 */
import ExcelJS from "exceljs";
// Cliente compartido: si están las variables TURSO_DATABASE_URL/TURSO_AUTH_TOKEN
// en el entorno, escribe directamente en Turso; si no, en el fichero local.
import { prisma } from "../src/lib/prisma";

function cell(row: ExcelJS.Row, idx: number): string | null {
  let v: any = row.getCell(idx).value;
  if (v === null || v === undefined) return null;

  // Fórmulas: usar el resultado calculado.
  if (typeof v === "object" && "result" in v) v = v.result;
  // Texto enriquecido (richText): concatenar los fragmentos.
  if (typeof v === "object" && Array.isArray(v.richText)) {
    v = v.richText.map((f: any) => f.text).join("");
  }
  // Hipervínculos: usar el texto visible.
  if (typeof v === "object" && "text" in v && "hyperlink" in v) v = v.text;
  // Fechas: formatear como ISO simple.
  if (v instanceof Date) v = v.toISOString().slice(0, 10);

  if (v === null || v === undefined) return null;
  if (typeof v === "object") return null; // tipo inesperado, no inventamos datos

  const s = String(v).trim();
  return s === "" ? null : s;
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("Uso: npx tsx scripts/import-estancos.ts <ruta al xlsx>");
    process.exit(1);
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const sheet = workbook.getWorksheet("BBDD ESTANCOS");
  if (!sheet) {
    console.error('No se ha encontrado la hoja "BBDD ESTANCOS" en el archivo.');
    process.exit(1);
  }

  let creados = 0;
  let actualizados = 0;
  let saltados = 0;

  const total = sheet.rowCount;
  for (let r = 2; r <= total; r++) {
    const row = sheet.getRow(r);
    const idEstanco = cell(row, 1);
    const nombre = cell(row, 2);
    if (!idEstanco || !nombre) {
      saltados += 1;
      continue;
    }

    const data = {
      idEstanco,
      nombre,
      direccion: cell(row, 3),
      municipio: cell(row, 4),
      codigoPostal: cell(row, 5),
      provincia: cell(row, 6),
      telefono: cell(row, 7),
      zona: cell(row, 8),
      frecuencia: cell(row, 9),
      segmento: cell(row, 10),
      comercial: cell(row, 11),
      telefonoComercial: cell(row, 12),
      comentarioComercial: cell(row, 13),
      correoComercial: cell(row, 14),
    };

    const existente = await prisma.estanco.findUnique({ where: { idEstanco } });
    if (existente) {
      await prisma.estanco.update({ where: { idEstanco }, data });
      actualizados += 1;
    } else {
      await prisma.estanco.create({ data });
      creados += 1;
    }

    if ((creados + actualizados) % 500 === 0) {
      console.log(`  ... ${creados + actualizados} procesados`);
    }
  }

  console.log(`Importación completada: ${creados} nuevos, ${actualizados} actualizados, ${saltados} filas saltadas (sin ID o nombre).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
