import { google } from "googleapis";
import { readFileSync } from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";
import { createClient } from "@libsql/client";

const CLIENT_EMAIL = process.env.GOOGLE_SHEETS_CLIENT_EMAIL;
const PRIVATE_KEY = process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\\n/g, "\n");
const SHEET_ID = "1lDe_66VPnJMPhCaBPuZyRwt9FEhhwHE0iWRvWYupgK0";

/**
 * Rellena el Excel "Credenciales Admira Trace" con 3 pestañas (Admira, FDM,
 * Técnicos), cada una con el email y la contraseña inicial de cada persona
 * con acceso a la app.
 *
 * Los técnicos se leen de credenciales-tecnicos.tsv (generado al importarlos,
 * es la única copia que existe de sus contraseñas en texto plano: en la base
 * de datos están hasheadas y no se pueden recuperar).
 */
function leerTecnicosDelTsv(): { nombre: string; usuario: string; password: string; email: string }[] {
  const contenido = readFileSync(path.join(__dirname, "..", "credenciales-tecnicos.tsv"), "utf-8");
  const lineas = contenido.split("\n");
  const filas: { nombre: string; usuario: string; password: string; email: string }[] = [];
  for (const linea of lineas) {
    const cols = linea.split("\t");
    if (cols.length !== 4) continue;
    const [nombre, usuario, password, email] = cols.map((c) => c.trim());
    if (nombre === "nombre" || !email || !email.includes("@")) continue; // cabecera o fila inválida
    filas.push({ nombre, usuario, password, email });
  }
  return filas;
}

async function main() {
  const auth = new google.auth.JWT({
    email: CLIENT_EMAIL,
    key: PRIVATE_KEY,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  const sheets = google.sheets({ version: "v4", auth });

  // 1. Asegurar que existen las 3 pestañas con esos nombres exactos.
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const existentes = new Set((meta.data.sheets || []).map((s) => s.properties?.title));
  const necesarias = ["Admira", "FDM", "Técnicos"];
  const faltantes = necesarias.filter((n) => !existentes.has(n));

  if (faltantes.length > 0) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: { requests: faltantes.map((title) => ({ addSheet: { properties: { title } } })) },
    });
  }

  // 2. Admira y FDM: por ahora solo existe una cuenta compartida de demo para
  // cada uno (no hay un listado de personas reales con email individual).
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: "'Admira'!A1",
    valueInputOption: "RAW",
    requestBody: {
      values: [
        ["Usuario", "Contraseña", "Notas"],
        ["admira", "admira", "Cuenta compartida de demo — pendiente de sustituir por cuentas individuales reales"],
      ],
    },
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: "'FDM'!A1",
    valueInputOption: "RAW",
    requestBody: {
      values: [
        ["Usuario", "Contraseña", "Notas"],
        ["fdm", "fdm", "Cuenta compartida de demo — pendiente de sustituir por cuentas individuales reales"],
      ],
    },
  });

  // 3. Técnicos: los 238 reales, con su contraseña temporal inicial — salvo
  // quien ya la haya cambiado desde la app, a quien no tiene sentido mostrarle
  // una contraseña que ya no es válida (no se puede recuperar la nueva: está
  // hasheada).
  const libsql = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!,
  });
  const prisma = new PrismaClient({ adapter: new PrismaLibSQL(libsql) });
  const yaCambiada = new Set(
    (await prisma.user.findMany({ where: { role: "TECNICO", passwordCambiadaAt: { not: null } }, select: { username: true } })).map(
      (u) => u.username
    )
  );

  const tecnicos = leerTecnicosDelTsv();
  const filas = [
    ["Empresa / nombre", "Usuario", "Contraseña inicial", "Email"],
    ...tecnicos.map((t) => [
      t.nombre,
      t.usuario,
      yaCambiada.has(t.usuario) ? "(ya cambiada por el usuario)" : t.password,
      t.email,
    ]),
  ];
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: "'Técnicos'!A1",
    valueInputOption: "RAW",
    requestBody: { values: filas },
  });

  console.log(`Hecho. Técnicos escritos: ${tecnicos.length}`);
}

main().catch(console.error);
