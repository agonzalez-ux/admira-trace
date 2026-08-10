import ExcelJS from "exceljs";
import path from "path";
import { PrismaClient } from "@prisma/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";
import { createClient } from "@libsql/client";

/**
 * Importa el material real (pantallas, PCs, tablets) desde la pestaña "STOCK"
 * del Excel "Copia de STOCK PANTALLAS FASE 5 AGOSTO 2026.xlsx" (descargado
 * antes con scripts/descargar-e-inspeccionar-stock.ts a stock-pantallas.xlsx).
 *
 * Reglas de mapeo (acordadas con el usuario):
 * - codigoBarras / numeroSerie = *SERIAL NUMBER (no hay columna de código de
 *   barras real, así que se usa el nº de serie como identificador único).
 * - TIPO: PANTALLA→PANTALLA, PC→REPRODUCTOR, TABLET→OTRO (con tipoPersonalizado).
 * - nombre = MARCA + Modelo.
 * - Estado:
 *     "Retirada de:" con valor           → BAJA
 *     INSTALADA = SI (tiene estanco)     → INSTALADO (ubicación = nombre del estanco)
 *     Tiene técnico sin estanco          → EN_TECNICO (se empareja por nombre de empresa)
 *     Ni estanco ni técnico              → EN_FDM (almacén por defecto)
 * - Filas sin TIPO ni nº de serie se descartan como incompletas.
 */
async function main() {
  const libsql = createClient({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN! });
  const prisma = new PrismaClient({ adapter: new PrismaLibSQL(libsql) });

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path.join(__dirname, "..", "stock-pantallas.xlsx"));
  const sheet = wb.getWorksheet("STOCK");
  if (!sheet) throw new Error('No se ha encontrado la pestaña "STOCK".');

  const tecnicos = await prisma.user.findMany({ where: { role: "TECNICO" }, select: { id: true, name: true } });
  const tecnicoPorNombre = new Map(tecnicos.map((t) => [t.name.trim().toUpperCase(), t.id]));

  const existentesMaterial = await prisma.material.findMany({ select: { codigoBarras: true } });
  const codigosExistentes = new Set(existentesMaterial.map((m) => m.codigoBarras));

  let creados = 0;
  let sinSerie = 0;
  let duplicados = 0;
  let sinTecnicoEncontrado = 0;
  const nuevos: any[] = [];

  sheet.eachRow((row, num) => {
    if (num === 1) return;
    const serie = String(row.getCell(2).value || "").trim();
    const tipoExcel = String(row.getCell(4).value || "").trim().toUpperCase();
    const marca = String(row.getCell(5).value || "").trim();
    const modelo = String(row.getCell(6).value || "").trim();
    const instalada = String(row.getCell(7).value || "").trim().toUpperCase();
    const estancoActual = String(row.getCell(8).value || "").trim();
    const tecnicoNombre = String(row.getCell(9).value || "").trim();
    const retiradaDe = row.getCell(13).value;

    if (!serie || !tipoExcel) {
      sinSerie += 1;
      return;
    }
    if (codigosExistentes.has(serie)) {
      duplicados += 1;
      return; // ya estaba dado de alta (por si se repite la importación)
    }
    codigosExistentes.add(serie);

    let tipo: string;
    let tipoPersonalizado: string | null = null;
    if (tipoExcel === "PANTALLA") tipo = "PANTALLA";
    else if (tipoExcel === "PC") tipo = "REPRODUCTOR";
    else {
      tipo = "OTRO";
      tipoPersonalizado = tipoExcel === "TABLET" ? "Tablet" : tipoExcel;
    }

    let estado: string;
    let ubicacion: string | null = null;
    let tecnicoId: string | null = null;

    if (retiradaDe) {
      estado = "BAJA";
    } else if (instalada === "SI" && estancoActual) {
      estado = "INSTALADO";
      ubicacion = estancoActual;
    } else if (tecnicoNombre) {
      const id = tecnicoPorNombre.get(tecnicoNombre.toUpperCase());
      if (id) {
        estado = "EN_TECNICO";
        tecnicoId = id;
      } else {
        estado = "EN_FDM";
        sinTecnicoEncontrado += 1;
      }
    } else {
      estado = "EN_FDM";
    }

    nuevos.push({
      codigoBarras: serie,
      numeroSerie: serie,
      tipo,
      tipoPersonalizado,
      nombre: [marca, modelo].filter(Boolean).join(" ") || modelo || marca || tipoExcel,
      estado,
      ubicacion,
      tecnicoId,
    });
    creados += 1;
  });

  console.log(
    `A crear: ${creados} · Filas incompletas: ${sinSerie} · Ya existían: ${duplicados} · Técnico no encontrado en la app: ${sinTecnicoEncontrado}`
  );

  const CHUNK = 300;
  for (let i = 0; i < nuevos.length; i += CHUNK) {
    await prisma.material.createMany({ data: nuevos.slice(i, i + CHUNK) });
    console.log(`  ${Math.min(i + CHUNK, nuevos.length)}/${nuevos.length}`);
  }

  console.log("Hecho.");
}

main().catch(console.error);
