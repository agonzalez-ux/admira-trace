import { PrismaClient } from "@prisma/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";
import { createClient } from "@libsql/client";

/**
 * Copia todas las tablas de la base de datos local (fichero SQLite) a Turso,
 * respetando el orden de dependencias por claves foráneas. Se usa una sola
 * vez, para llevar a producción los datos reales ya cargados y verificados en
 * local (239 técnicos, 13.598 estancos…) sin tener que reimportarlos desde
 * cero ni generar contraseñas nuevas.
 *
 * Uso: TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... npx tsx scripts/clonar-local-a-turso.ts
 */
const CHUNK = 500;

async function copiarEnBloques<T>(nombre: string, filas: T[], insertar: (bloque: T[]) => Promise<unknown>) {
  if (filas.length === 0) {
    console.log(`${nombre}: nada que copiar.`);
    return;
  }
  for (let i = 0; i < filas.length; i += CHUNK) {
    await insertar(filas.slice(i, i + CHUNK));
  }
  console.log(`${nombre}: ${filas.length} filas copiadas.`);
}

async function main() {
  const tursoUrl = process.env.TURSO_DATABASE_URL;
  const tursoToken = process.env.TURSO_AUTH_TOKEN;
  if (!tursoUrl || !tursoToken) {
    console.error("Faltan TURSO_DATABASE_URL y/o TURSO_AUTH_TOKEN en el entorno.");
    process.exit(1);
  }

  const local = new PrismaClient(); // Lee del fichero local (DATABASE_URL del .env).
  const libsql = createClient({ url: tursoUrl, authToken: tursoToken });
  const turso = new PrismaClient({ adapter: new PrismaLibSQL(libsql) });

  // Comprobación de seguridad: no sobrescribir una Turso que ya tenga datos,
  // para no machacar por error una base ya usada en producción.
  const yaTieneDatos = (await turso.user.count()) > 0 || (await turso.estanco.count()) > 0;
  if (yaTieneDatos) {
    console.error("La base de Turso ya tiene datos. Cancelado para no sobrescribir nada.");
    process.exit(1);
  }

  // Orden de copia: primero las tablas sin dependencias, luego las que
  // referencian a otras, en el mismo orden que sus claves foráneas.
  await copiarEnBloques("Estanco", await local.estanco.findMany(), (b) => turso.estanco.createMany({ data: b }));
  await copiarEnBloques("User", await local.user.findMany(), (b) => turso.user.createMany({ data: b }));
  await copiarEnBloques("PasswordResetToken", await local.passwordResetToken.findMany(), (b) =>
    turso.passwordResetToken.createMany({ data: b })
  );
  await copiarEnBloques("OrdenRecurrente", await local.ordenRecurrente.findMany(), (b) =>
    turso.ordenRecurrente.createMany({ data: b })
  );
  await copiarEnBloques("Material", await local.material.findMany(), (b) => turso.material.createMany({ data: b }));
  await copiarEnBloques("MaterialEvento", await local.materialEvento.findMany(), (b) =>
    turso.materialEvento.createMany({ data: b })
  );
  await copiarEnBloques("Envio", await local.envio.findMany(), (b) => turso.envio.createMany({ data: b }));
  await copiarEnBloques("EnvioItem", await local.envioItem.findMany(), (b) => turso.envioItem.createMany({ data: b }));
  await copiarEnBloques("Incidencia", await local.incidencia.findMany(), (b) =>
    turso.incidencia.createMany({ data: b })
  );
  await copiarEnBloques("NotificacionComercial", await local.notificacionComercial.findMany(), (b) =>
    turso.notificacionComercial.createMany({ data: b })
  );
  await copiarEnBloques("FotoEvidencia", await local.fotoEvidencia.findMany(), (b) =>
    turso.fotoEvidencia.createMany({ data: b })
  );
  await copiarEnBloques("IncidenciaMaterial", await local.incidenciaMaterial.findMany(), (b) =>
    turso.incidenciaMaterial.createMany({ data: b })
  );

  await local.$disconnect();
  await turso.$disconnect();
  console.log("Clonado completo.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
