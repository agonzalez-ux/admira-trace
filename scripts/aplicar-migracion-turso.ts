import { createClient } from "@libsql/client";
import { readFileSync } from "fs";
import path from "path";

/**
 * Aplica el SQL de `prisma/migrations/<carpeta>/migration.sql` directamente a
 * una base de datos Turso, usando el cliente libSQL (no la CLI de Prisma, que
 * no sabe hablar con URLs libsql:// para migrar/hacer push).
 *
 * Uso:
 *   TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... npx tsx scripts/aplicar-migracion-turso.ts 0001_init
 */
async function main() {
  const carpeta = process.argv[2];
  if (!carpeta) {
    console.error("Uso: npx tsx scripts/aplicar-migracion-turso.ts <carpeta-de-la-migración>");
    process.exit(1);
  }

  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!url || !authToken) {
    console.error("Faltan TURSO_DATABASE_URL y/o TURSO_AUTH_TOKEN en el entorno.");
    process.exit(1);
  }

  const rutaSql = path.join(__dirname, "..", "prisma", "migrations", carpeta, "migration.sql");
  const sql = readFileSync(rutaSql, "utf-8");

  const client = createClient({ url, authToken });
  console.log(`Aplicando ${rutaSql} a ${url} …`);

  // Se ejecuta sentencia a sentencia (en vez de executeMultiple) para poder
  // saber exactamente cuál falla si algo va mal. Se quitan las líneas de
  // comentario de cada trozo antes de comprobar si queda SQL de verdad.
  const sentencias = sql
    .split(";")
    .map((s) =>
      s
        .split("\n")
        .filter((linea) => !linea.trim().startsWith("--"))
        .join("\n")
        .trim()
    )
    .filter((s) => s.length > 0);

  for (const [i, sentencia] of sentencias.entries()) {
    try {
      await client.execute(sentencia);
    } catch (err) {
      console.error(`Falló la sentencia ${i + 1}/${sentencias.length}:\n${sentencia}\n`);
      throw err;
    }
  }
  console.log(`Hecho. ${sentencias.length} sentencias aplicadas.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
