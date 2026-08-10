/**
 * Detecta a qué documento corresponde cada Google Sheet ya creado y compartido
 * por el usuario (por título), añade las pestañas que le faltan replicando el
 * Excel original, y muestra las variables de entorno a guardar.
 *
 * Uso: npx tsx scripts/setup-document-sheets.ts <id1> <id2> ...
 */
import { google } from "googleapis";
import { DOCUMENTOS, DocumentKey } from "../src/lib/documentSheets";

const CLIENT_EMAIL = process.env.GOOGLE_SHEETS_CLIENT_EMAIL;
const PRIVATE_KEY = process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\\n/g, "\n");

const ENV_VAR_BY_KEY: Record<DocumentKey, string> = {
  materiales: "GOOGLE_SHEETS_STOCK_ID",
  incidencias: "GOOGLE_SHEETS_INFORME_ID",
  intervenciones: "GOOGLE_SHEETS_INTERVENCIONES_ID",
  censo: "GOOGLE_SHEETS_CENSO_ID",
  estancos: "GOOGLE_SHEETS_ESTANCOS_ID",
};

async function main() {
  const ids = process.argv.slice(2);
  if (ids.length === 0) {
    console.error("Uso: npx tsx scripts/setup-document-sheets.ts <id1> <id2> ...");
    process.exit(1);
  }
  if (!CLIENT_EMAIL || !PRIVATE_KEY) {
    console.error("Faltan GOOGLE_SHEETS_CLIENT_EMAIL / GOOGLE_SHEETS_PRIVATE_KEY en el entorno.");
    process.exit(1);
  }

  const auth = new google.auth.JWT({
    email: CLIENT_EMAIL,
    key: PRIVATE_KEY,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  const sheets = google.sheets({ version: "v4", auth });

  const titleToKey = new Map<string, DocumentKey>();
  for (const key of Object.keys(DOCUMENTOS) as DocumentKey[]) {
    titleToKey.set(DOCUMENTOS[key].titulo, key);
  }

  const resultado: Record<string, string> = {};

  for (const id of ids) {
    const meta = await sheets.spreadsheets.get({ spreadsheetId: id });
    const titulo = meta.data.properties?.title || "";
    const key = titleToKey.get(titulo);

    if (!key) {
      console.error(`⚠️  No reconozco el título "${titulo}" (id ${id}). Lo salto — revisa que el nombre sea exacto.`);
      continue;
    }

    console.log(`"${titulo}" -> documento "${key}"`);

    const doc = DOCUMENTOS[key];
    const existentes = new Set((meta.data.sheets || []).map((s) => s.properties?.title));
    const primeraHojaId = meta.data.sheets?.[0]?.properties?.sheetId;
    const primeraHojaTitulo = meta.data.sheets?.[0]?.properties?.title;

    const requests: any[] = [];

    // Si solo hay una pestaña por defecto (p. ej. "Hoja 1"), la renombramos
    // para que sea la pestaña de datos en vivo en vez de crear una duplicada.
    if (meta.data.sheets?.length === 1 && primeraHojaTitulo !== doc.dataTab && !existentes.has(doc.dataTab)) {
      requests.push({
        updateSheetProperties: {
          properties: { sheetId: primeraHojaId, title: doc.dataTab },
          fields: "title",
        },
      });
      existentes.add(doc.dataTab);
    } else if (!existentes.has(doc.dataTab)) {
      requests.push({ addSheet: { properties: { title: doc.dataTab } } });
    }

    for (const pestaña of doc.otrasPestañas) {
      if (!existentes.has(pestaña)) {
        requests.push({ addSheet: { properties: { title: pestaña } } });
      }
    }

    if (requests.length > 0) {
      await sheets.spreadsheets.batchUpdate({ spreadsheetId: id, requestBody: { requests } });
      console.log(`  -> ${requests.length} pestañas añadidas/ajustadas.`);
    } else {
      console.log("  -> ya tenía todas las pestañas.");
    }

    resultado[ENV_VAR_BY_KEY[key]] = id;
  }

  console.log("\n=== Añade esto a tu .env ===\n");
  for (const [envVar, id] of Object.entries(resultado)) {
    console.log(`${envVar}="${id}"`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
