/**
 * Importa el directorio maestro de estancos directamente desde el Google
 * Sheet "Universo Comerciales" (hoja "BBDD ESTANCOS"), en vez de necesitar
 * subir el Excel original a mano. Usa las mismas credenciales de servicio ya
 * configuradas para la sincronización en vivo (GOOGLE_SHEETS_CLIENT_EMAIL /
 * GOOGLE_SHEETS_PRIVATE_KEY / GOOGLE_SHEETS_ESTANCOS_ID).
 *
 * Mismo mapeo de columnas que scripts/import-estancos.ts (que lee del
 * Excel): ID Estanco, Nombre, Dirección, Municipio, CP, Provincia,
 * Teléfono, Zona, Frecuencia, Segmento, Comercial, Teléfono Comercial,
 * Comentario Comercial, Correo Comercial — en ese orden, columnas A-N.
 *
 * Uso: npx tsx scripts/import-estancos-desde-sheets.ts
 */
import { google } from "googleapis";
// Cliente compartido: si están las variables TURSO_DATABASE_URL/TURSO_AUTH_TOKEN
// en el entorno, escribe directamente en Turso; si no, en el fichero local.
import { prisma } from "../src/lib/prisma";

const CLIENT_EMAIL = process.env.GOOGLE_SHEETS_CLIENT_EMAIL;
const PRIVATE_KEY = process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\\n/g, "\n");
const SHEET_ID = process.env.GOOGLE_SHEETS_ESTANCOS_ID;

function limpiar(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : v != null ? String(v).trim() : "";
  return s === "" ? null : s;
}

async function main() {
  if (!CLIENT_EMAIL || !PRIVATE_KEY || !SHEET_ID) {
    console.error("Faltan GOOGLE_SHEETS_CLIENT_EMAIL / GOOGLE_SHEETS_PRIVATE_KEY / GOOGLE_SHEETS_ESTANCOS_ID en el entorno.");
    process.exit(1);
  }

  const auth = new google.auth.JWT({
    email: CLIENT_EMAIL,
    key: PRIVATE_KEY,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  const sheets = google.sheets({ version: "v4", auth });

  console.log("Leyendo 'BBDD ESTANCOS' del Google Sheet...");
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: "'BBDD ESTANCOS'!A2:N",
  });
  const filas = res.data.values || [];
  console.log(`${filas.length} filas leídas.`);

  let creados = 0;
  let actualizados = 0;
  let saltados = 0;

  for (const row of filas) {
    const idEstanco = limpiar(row[0]);
    const nombre = limpiar(row[1]);
    if (!idEstanco || !nombre) {
      saltados += 1;
      continue;
    }

    const data = {
      idEstanco,
      nombre,
      direccion: limpiar(row[2]),
      municipio: limpiar(row[3]),
      codigoPostal: limpiar(row[4]),
      provincia: limpiar(row[5]),
      telefono: limpiar(row[6]),
      zona: limpiar(row[7]),
      frecuencia: limpiar(row[8]),
      segmento: limpiar(row[9]),
      comercial: limpiar(row[10]),
      telefonoComercial: limpiar(row[11]),
      comentarioComercial: limpiar(row[12]),
      correoComercial: limpiar(row[13]),
    };

    const existente = await prisma.estanco.findUnique({ where: { idEstanco } });
    if (existente) {
      await prisma.estanco.update({ where: { idEstanco }, data });
      actualizados += 1;
    } else {
      await prisma.estanco.create({ data });
      creados += 1;
    }

    if ((creados + actualizados) % 1000 === 0) {
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
