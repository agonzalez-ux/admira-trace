/**
 * Importa los técnicos reales desde el Google Sheet "New Técnicos"
 * (hojas "Técnicos España" y "Técnicos Portugal") como cuentas de usuario.
 *
 * Uso: node --env-file=.env node_modules/tsx/dist/cli.mjs scripts/import-tecnicos.ts
 *
 * Cada técnico recibe un usuario derivado de su email (parte antes de la @) y
 * una contraseña temporal aleatoria que se imprime al final: hay que
 * comunicársela a cada uno para que la cambie. NO se inventan emails: si una
 * fila no trae email, se salta y se informa.
 */
import { google } from "googleapis";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
// Cliente compartido: si están las variables TURSO_DATABASE_URL/TURSO_AUTH_TOKEN
// en el entorno, escribe directamente en Turso; si no, en el fichero local.
import { prisma } from "../src/lib/prisma";

const CLIENT_EMAIL = process.env.GOOGLE_SHEETS_CLIENT_EMAIL;
const PRIVATE_KEY = process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\\n/g, "\n");
const SHEET_ID = "1YXCtIqc-D4zC3JiUra-8PmgKOsclQV5zNZuPs6rEjaA";

type Fila = {
  empresa: string;
  provincia: string;
  personaContacto: string;
  email: string;
  telefono: string;
  direccion: string;
  cp: string;
  horario: string;
  radioCobertura: string;
  costeKm: string;
  condiciones: string;
};

function limpiar(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/**
 * Algunas celdas traen varios emails ("a@x.com, b@y.com" o "a@x/b@y").
 * Nos quedamos con el primero como email de contacto principal.
 */
function primerEmail(celda: string): string {
  const partes = celda.split(/[,;\s]+|(?<=\.[a-z]{2,4})\//i);
  const encontrado = partes.map((p) => p.trim()).find((p) => /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(p));
  return encontrado || "";
}

/**
 * Usuario derivado del nombre de la empresa (no del email): es mucho más
 * reconocible para el técnico que "sat" o "comercial", que además se repiten
 * mucho entre proveedores distintos. Solo letras y números, sin separadores.
 */
async function generarUsername(empresa: string, usados: Set<string>): Promise<string> {
  const base =
    empresa
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "")
      .slice(0, 20) || "tecnico";
  let candidato = base;
  let n = 2;
  while (usados.has(candidato) || (await prisma.user.findUnique({ where: { username: candidato } }))) {
    candidato = `${base}${n}`;
    n += 1;
  }
  usados.add(candidato);
  return candidato;
}

async function leerHoja(sheets: any, tab: string, offsetCol: number): Promise<Fila[]> {
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `'${tab}'!A1:P400` });
  const rows: unknown[][] = res.data.values || [];

  // Localizar la fila de cabeceras (la que contiene "EMAIL").
  const idxCabecera = rows.findIndex((r) => r.some((c) => limpiar(c).toUpperCase() === "EMAIL"));
  if (idxCabecera === -1) {
    console.warn(`  ⚠️ No se ha encontrado la cabecera con "EMAIL" en "${tab}", se salta.`);
    return [];
  }

  const cabecera = rows[idxCabecera].map((c) => limpiar(c).toUpperCase());
  const col = (nombre: string) => cabecera.findIndex((c) => c === nombre);

  const iEmpresa = col("EMPRESA");
  const iProvincia = col("PROVINCIA");
  const iContacto = col("PERSONA DE CONTACTO");
  const iEmail = col("EMAIL");
  const iTelefono = col("TELÉFONO");
  const iDireccion = col("DIRECCION");
  const iCp = col("CP");
  const iHorario = col("HORARIO");
  const iRadio = col("RADIO DE COBERTURA SIN COSTE");
  const iCoste = col("COSTE KM");
  const iCond = cabecera.findIndex((c) => c === "CONDICIONES" || c === "COMENTARIO");

  const filas: Fila[] = [];
  for (let r = idxCabecera + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const empresa = limpiar(row[iEmpresa]);
    const email = limpiar(row[iEmail]);
    if (!empresa) continue;
    filas.push({
      empresa,
      provincia: limpiar(row[iProvincia]),
      personaContacto: limpiar(row[iContacto]),
      email,
      telefono: limpiar(row[iTelefono]),
      direccion: limpiar(row[iDireccion]),
      cp: limpiar(row[iCp]),
      horario: limpiar(row[iHorario]),
      radioCobertura: iRadio >= 0 ? limpiar(row[iRadio]) : "",
      costeKm: iCoste >= 0 ? limpiar(row[iCoste]) : "",
      condiciones: iCond >= 0 ? limpiar(row[iCond]) : "",
    });
  }
  return filas;
}

async function main() {
  if (!CLIENT_EMAIL || !PRIVATE_KEY) {
    console.error("Faltan credenciales de Google en el entorno.");
    process.exit(1);
  }

  const auth = new google.auth.JWT({
    email: CLIENT_EMAIL,
    key: PRIVATE_KEY,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  const sheets = google.sheets({ version: "v4", auth });

  console.log("Leyendo técnicos de España...");
  const espana = await leerHoja(sheets, "Técnicos España", 0);
  console.log(`  ${espana.length} filas`);

  console.log("Leyendo técnicos de Portugal...");
  const portugal = await leerHoja(sheets, "Técnicos Portugal", 1);
  console.log(`  ${portugal.length} filas`);

  const todas = [...espana, ...portugal];
  const usados = new Set<string>();
  const credenciales: { nombre: string; username: string; password: string; email: string }[] = [];

  let creados = 0;
  let actualizados = 0;
  let sinEmail = 0;

  for (const f of todas) {
    const email = primerEmail(f.email);
    if (!email) {
      sinEmail += 1;
      continue;
    }

    const datos = {
      name: f.empresa,
      email,
      phone: f.telefono || null,
      zona: f.provincia || null,
      direccion: [f.direccion, f.cp, f.provincia].filter(Boolean).join(", ") || null,
      codigoPostal: f.cp || null,
      personaContacto: f.personaContacto || null,
      horario: f.horario || null,
      radioCobertura: f.radioCobertura || null,
      costeKm: f.costeKm || null,
      condiciones: f.condiciones || null,
    };

    // Se busca por nombre de empresa: es el identificador estable entre
    // ejecuciones (el email puede corregirse en la hoja).
    const existente = await prisma.user.findFirst({ where: { role: "TECNICO", name: f.empresa } });

    if (existente) {
      await prisma.user.update({ where: { id: existente.id }, data: datos });
      actualizados += 1;
      continue;
    }

    const username = await generarUsername(f.empresa, usados);
    const passwordPlano = randomBytes(6).toString("base64url");

    await prisma.user.create({
      data: {
        ...datos,
        username,
        password: bcrypt.hashSync(passwordPlano, 10),
        role: "TECNICO",
        // Contraseña temporal: la app le obligará a cambiarla al entrar.
        debeCambiarPassword: true,
      },
    });
    credenciales.push({ nombre: f.empresa, username, password: passwordPlano, email });
    creados += 1;
  }

  console.log(`\nImportación completada: ${creados} creados, ${actualizados} actualizados, ${sinEmail} saltados (sin email).`);

  if (credenciales.length > 0) {
    console.log("\n=== CREDENCIALES TEMPORALES (comunicar a cada técnico) ===");
    console.log("nombre\tusuario\tcontraseña\temail");
    for (const c of credenciales) {
      console.log(`${c.nombre}\t${c.username}\t${c.password}\t${c.email}`);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
