/**
 * Rellena las coordenadas (lat/lon) de estancos y técnicos a partir de la
 * base de datos ya geocodificada del proyecto "Tecnico Cerca"
 * (backend/data/tecnico_cerca.sqlite), en vez de depender de geocodificar
 * uno a uno contra Nominatim en el momento de asignar (lento, limitado a
 * 1 petición/segundo, y solo cubre lo que se ha ido consultando).
 *
 * Esa base ya trae ~13.600 estancos y ~180 técnicos geocodificados, así que
 * usarla de partida deja "Ver técnicos más cercanos" funcionando al
 * instante para casi todos los casos.
 *
 * No pisa coordenadas que ya existan en Admira Trace (p. ej. las resueltas
 * a mano o ya geocodificadas on-demand): solo rellena las que faltan.
 *
 * Uso: npx tsx scripts/importar-coordenadas-tecnico-cerca.ts [ruta al .sqlite]
 * (por defecto usa scripts/tecnico_cerca.sqlite)
 */
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
// Cliente compartido: si están las variables TURSO_DATABASE_URL/TURSO_AUTH_TOKEN
// en el entorno, escribe directamente en Turso; si no, en el fichero local.
import { prisma } from "../src/lib/prisma";

function normalizarNombre(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** El campo email del zip a veces trae varios, separados por coma/punto y coma. */
function listaEmails(celda: string | null): string[] {
  if (!celda) return [];
  return celda
    .split(/[,;]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

type Coords = { lat: number; lon: number };

async function main() {
  const dbPath = process.argv[2] || path.join(__dirname, "tecnico_cerca.sqlite");
  console.log(`Leyendo coordenadas ya geocodificadas de: ${dbPath}`);

  const db = new DatabaseSync(dbPath, { readOnly: true });

  // --- Estancos: cruce directo por id_estanco (misma referencia que en Admira Trace) ---
  const estancosZip = db
    .prepare(
      "SELECT id_estanco, latitud, longitud FROM estancos WHERE latitud IS NOT NULL AND longitud IS NOT NULL",
    )
    .all() as { id_estanco: string; latitud: number; longitud: number }[];

  console.log(`\nEstancos geocodificados en el zip: ${estancosZip.length}`);

  let estancosActualizados = 0;
  let estancosYaTenian = 0;
  let estancosSinCoincidencia = 0;

  for (const e of estancosZip) {
    const actual = await prisma.estanco.findUnique({ where: { idEstanco: e.id_estanco } });
    if (!actual) {
      estancosSinCoincidencia += 1;
      continue;
    }
    if (actual.lat !== null && actual.lon !== null) {
      estancosYaTenian += 1;
      continue;
    }
    await prisma.estanco.update({
      where: { idEstanco: e.id_estanco },
      data: { lat: e.latitud, lon: e.longitud },
    });
    estancosActualizados += 1;
    if (estancosActualizados % 1000 === 0) console.log(`  ... ${estancosActualizados} estancos actualizados`);
  }

  console.log(
    `Estancos → actualizados: ${estancosActualizados} | ya tenían coordenadas: ${estancosYaTenian} | sin coincidencia en Admira Trace: ${estancosSinCoincidencia}`,
  );

  // --- Técnicos: cruce por nombre de empresa normalizado, con email como respaldo ---
  const tecnicosZip = db
    .prepare(
      "SELECT empresa, email, latitud, longitud FROM tecnicos WHERE latitud IS NOT NULL AND longitud IS NOT NULL",
    )
    .all() as { empresa: string; email: string | null; latitud: number; longitud: number }[];

  console.log(`\nTécnicos geocodificados en el zip: ${tecnicosZip.length}`);

  const porNombre = new Map<string, Coords>();
  const porEmail = new Map<string, Coords>();
  for (const t of tecnicosZip) {
    const coords = { lat: t.latitud, lon: t.longitud };
    porNombre.set(normalizarNombre(t.empresa), coords);
    for (const email of listaEmails(t.email)) porEmail.set(email, coords);
  }

  const tecnicosAdmira = await prisma.user.findMany({
    where: { role: "TECNICO" },
    select: { id: true, name: true, email: true, lat: true, lon: true },
  });

  let tecnicosActualizados = 0;
  let tecnicosYaTenian = 0;
  let tecnicosSinCoincidencia = 0;

  for (const t of tecnicosAdmira) {
    if (t.lat !== null && t.lon !== null) {
      tecnicosYaTenian += 1;
      continue;
    }
    const match = porNombre.get(normalizarNombre(t.name)) ?? (t.email ? porEmail.get(t.email.trim().toLowerCase()) : undefined);
    if (!match) {
      tecnicosSinCoincidencia += 1;
      continue;
    }
    await prisma.user.update({ where: { id: t.id }, data: { lat: match.lat, lon: match.lon } });
    tecnicosActualizados += 1;
  }

  console.log(
    `Técnicos → actualizados: ${tecnicosActualizados} | ya tenían coordenadas: ${tecnicosYaTenian} | sin coincidencia: ${tecnicosSinCoincidencia}`,
  );

  db.close();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
