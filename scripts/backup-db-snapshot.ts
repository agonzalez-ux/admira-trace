import { createClient } from "@libsql/client";

/**
 * Genera un snapshot consistente de la base de datos SQLite en el mismo
 * volumen, vía `VACUUM INTO` (seguro incluso con escrituras concurrentes en
 * modo WAL — a diferencia de copiar el fichero .db a pelo). El resultado
 * queda dentro del volumen; el script de orquestación (`backup/backup-diario.sh`)
 * lo saca de ahí montando el mismo volumen en un contenedor efímero, igual
 * que el resto de scripts one-off del proyecto.
 *
 * Uso: npx tsx scripts/backup-db-snapshot.ts <ruta-destino .db>
 * Ejemplo: npx tsx scripts/backup-db-snapshot.ts /staging/db-2026-08-27.db
 */
async function main() {
  const destino = process.argv[2];
  if (!destino) {
    console.error("Uso: backup-db-snapshot.ts <ruta-destino .db>");
    process.exit(1);
  }

  const origenUrl = process.env.DATABASE_URL;
  if (!origenUrl || !origenUrl.startsWith("file:")) {
    console.error("DATABASE_URL debe apuntar a un fichero local (file:...). Este script no sirve con Turso.");
    process.exit(1);
  }

  const db = createClient({ url: origenUrl });
  await db.execute(`VACUUM INTO '${destino.replace(/'/g, "''")}'`);
  console.log(`[backup-db] Snapshot creado en ${destino}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
