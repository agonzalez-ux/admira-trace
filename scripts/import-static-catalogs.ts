/**
 * Copia UNA VEZ (foto fija, no se auto-actualiza) los catálogos de referencia
 * reales que no cambian por acciones de la app: PROVINCIAS, MEDIDAS TFTS,
 * "zonas sin tec" (del Censo) y Estancos_Canarias/Peninsula/Portugal (de
 * Intervenciones). Deja siempre una nota indicando la fecha de la copia.
 *
 * Uso: npx tsx --env-file=.env scripts/import-static-catalogs.ts
 */
import ExcelJS from "exceljs";
import { google } from "googleapis";

const CLIENT_EMAIL = process.env.GOOGLE_SHEETS_CLIENT_EMAIL;
const PRIVATE_KEY = process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\\n/g, "\n");
const CENSO_ID = process.env.GOOGLE_SHEETS_CENSO_ID;
const INTERVENCIONES_ID = process.env.GOOGLE_SHEETS_INTERVENCIONES_ID;

const DOWNLOADS = "C:\\Users\\Aroa González\\Downloads\\";

function cell(row: ExcelJS.Row, idx: number): string {
  const v = row.getCell(idx).value;
  if (v === null || v === undefined) return "";
  if (typeof v === "object" && "result" in (v as any)) return String((v as any).result ?? "");
  if (typeof v === "object" && Array.isArray((v as any).richText)) {
    return (v as any).richText.map((f: any) => f.text).join("");
  }
  if (v instanceof Date) return v.toLocaleDateString("es-ES");
  return String(v);
}

function readSheet(workbook: ExcelJS.Workbook, sheetName: string, maxCols: number): string[][] {
  const ws = workbook.getWorksheet(sheetName);
  if (!ws) {
    console.warn(`  ⚠️ hoja "${sheetName}" no encontrada`);
    return [];
  }
  const rows: string[][] = [];
  ws.eachRow((row) => {
    const vals: string[] = [];
    for (let c = 1; c <= maxCols; c++) vals.push(cell(row, c));
    if (vals.some((v) => v !== "")) rows.push(vals);
  });
  return rows;
}

async function writeStatic(sheets: any, spreadsheetId: string, tab: string, rows: string[][]) {
  const fecha = new Date().toLocaleDateString("es-ES");
  const nota = [[`📌 Copia estática del Excel original a fecha ${fecha}. No se actualiza sola.`]];

  await sheets.spreadsheets.values.clear({ spreadsheetId, range: `${tab}!A1:Z10000` });
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${tab}!A1`,
    valueInputOption: "RAW",
    requestBody: { values: [...nota, [], ...rows] },
  });
  console.log(`  -> "${tab}": ${rows.length} filas`);
}

async function main() {
  if (!CLIENT_EMAIL || !PRIVATE_KEY || !CENSO_ID || !INTERVENCIONES_ID) {
    console.error("Faltan variables de entorno (credenciales o IDs de Censo/Intervenciones).");
    process.exit(1);
  }

  const auth = new google.auth.JWT({
    email: CLIENT_EMAIL,
    key: PRIVATE_KEY,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  const sheets = google.sheets({ version: "v4", auth });

  console.log("Leyendo catálogos del Censo...");
  const censoWb = new ExcelJS.Workbook();
  await censoWb.xlsx.readFile(DOWNLOADS + "5ª  FASE Censo_Total_APP.xlsx");
  const provincias = readSheet(censoWb, "PROVINCIAS", 1);
  const medidas = readSheet(censoWb, "MEDIDAS TFTS", 6);
  const zonasSinTec = readSheet(censoWb, "zonas sin tec", 4);

  console.log("Escribiendo en el Google Sheet de Censo...");
  await writeStatic(sheets, CENSO_ID, "PROVINCIAS", provincias);
  await writeStatic(sheets, CENSO_ID, "MEDIDAS TFTS", medidas);
  await writeStatic(sheets, CENSO_ID, "zonas sin tec", zonasSinTec);

  console.log("Leyendo catálogos de Intervenciones...");
  const intervWb = new ExcelJS.Workbook();
  await intervWb.xlsx.readFile(DOWNLOADS + "Intervenciones 2026 2do Semestre.xlsx");
  const canarias = readSheet(intervWb, "Estancos_Canarias", 2);
  const peninsula = readSheet(intervWb, "Estancos_Peninsula", 2);
  const portugal = readSheet(intervWb, "Estancos_Portugal", 2);

  console.log("Escribiendo en el Google Sheet de Intervenciones...");
  await writeStatic(sheets, INTERVENCIONES_ID, "Estancos_Canarias", canarias);
  await writeStatic(sheets, INTERVENCIONES_ID, "Estancos_Peninsula", peninsula);
  await writeStatic(sheets, INTERVENCIONES_ID, "Estancos_Portugal", portugal);

  console.log("\nHecho.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
