import { google } from "googleapis";
import { PrismaClient } from "@prisma/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";
import { createClient } from "@libsql/client";

/**
 * Sincroniza el directorio de estancos desde el Google Sheet real "Universo
 * Comerciales Agosto 2026" (pestaña "BBDD ESTANCOS"), que sustituye como
 * fuente al Excel local que se usaba antes.
 *
 * Actualiza los estancos que ya existían (por idEstanco) y crea los nuevos.
 * No borra los que ya no aparezcan en la hoja: como Incidencia.estancoId
 * apunta a Estanco, borrar de más podría desvincular incidencias reales sin
 * necesidad. Al final se informa de cuántos hay en la base que no están en la
 * hoja nueva, por si hay que revisarlos a mano.
 */
const SPREADSHEET_ID = "1elt_5nBrLicdoZZ8xe8207JaltSnGFrBjsxvjXSeMc4";
const CLIENT_EMAIL = process.env.GOOGLE_SHEETS_CLIENT_EMAIL;
const PRIVATE_KEY = process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\\n/g, "\n");

function limpiar(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s.length > 0 ? s : null;
}

// El texto genérico "Contactar con comercial de zona o central" no es un
// email real: se guarda igual (así lo teníamos ya) pero no cuenta como un
// correo válido para las notificaciones automáticas.
function limpiarCorreo(v: unknown): string | null {
  return limpiar(v);
}

async function main() {
  const auth = new google.auth.JWT({
    email: CLIENT_EMAIL,
    key: PRIVATE_KEY,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  const sheets = google.sheets({ version: "v4", auth });

  console.log("Leyendo la hoja...");
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: "'BBDD ESTANCOS'!A2:N",
  });
  const filas = res.data.values || [];
  console.log(`${filas.length} filas leídas.`);

  const libsql = createClient({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN! });
  const prisma = new PrismaClient({ adapter: new PrismaLibSQL(libsql) });

  const existentes = await prisma.estanco.findMany({ select: { id: true, idEstanco: true } });
  const mapaExistentes = new Map(existentes.map((e) => [e.idEstanco, e.id]));
  console.log(`${existentes.length} estancos ya en la base.`);

  const vistos = new Set<string>();
  const nuevos: any[] = [];
  const actualizaciones: { id: string; data: any }[] = [];
  let filasInvalidas = 0;

  for (const row of filas) {
    const idEstanco = limpiar(row[0]);
    if (!idEstanco) {
      filasInvalidas += 1;
      continue;
    }
    if (vistos.has(idEstanco)) continue; // por si hay duplicados en la propia hoja
    vistos.add(idEstanco);

    const datos = {
      nombre: limpiar(row[1]) || idEstanco,
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
      correoComercial: limpiarCorreo(row[13]),
    };

    const idExistente = mapaExistentes.get(idEstanco);
    if (idExistente) {
      actualizaciones.push({ id: idExistente, data: datos });
    } else {
      nuevos.push({ idEstanco, ...datos });
    }
  }

  console.log(`Nuevos: ${nuevos.length} · A actualizar: ${actualizaciones.length} · Filas inválidas: ${filasInvalidas}`);

  // Altas, en bloques.
  const CHUNK = 500;
  for (let i = 0; i < nuevos.length; i += CHUNK) {
    await prisma.estanco.createMany({ data: nuevos.slice(i, i + CHUNK) });
    console.log(`  altas ${Math.min(i + CHUNK, nuevos.length)}/${nuevos.length}`);
  }

  // Actualizaciones, en transacciones agrupadas para no hacer una petición
  // de red por cada una de las 13.000+ filas.
  const CHUNK_UPD = 200;
  for (let i = 0; i < actualizaciones.length; i += CHUNK_UPD) {
    const bloque = actualizaciones.slice(i, i + CHUNK_UPD);
    await prisma.$transaction(bloque.map((u) => prisma.estanco.update({ where: { id: u.id }, data: u.data })));
    console.log(`  actualizados ${Math.min(i + CHUNK_UPD, actualizaciones.length)}/${actualizaciones.length}`);
  }

  const noPresentes = existentes.filter((e) => !vistos.has(e.idEstanco));
  console.log(`\nHecho. Estancos que había antes y NO están en la hoja nueva: ${noPresentes.length}`);
  if (noPresentes.length > 0 && noPresentes.length <= 30) {
    console.log(noPresentes.map((e) => e.idEstanco).join(", "));
  }
}

main().catch(console.error);
