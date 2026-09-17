import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { prisma } from "../src/lib/prisma";
import { registrarCredencial } from "../src/lib/credencialesVault";

/**
 * Alta de las 3 cuentas de Moisés Zavaleta (una por portal — la app solo
 * admite un rol por cuenta, ver [[alta-usuarios-staff]]).
 *
 * Uso (mismo patrón que el resto de scripts one-off contra producción):
 *   docker build --target builder -t admira-builder-temp .
 *   docker run --rm \
 *     -v admira-trace_admira-db:/data -e DATABASE_URL="file:/data/admira-trace.db" \
 *     -v /data/secreto:/data/secreto -e SECRETO_DIR=/data/secreto \
 *     admira-builder-temp npx tsx scripts/crear-usuarios-mzavaleta.ts
 *   docker rmi admira-builder-temp
 */
const NOMBRE = "Moisés Zavaleta";
const EMAIL = "mzavaleta@admira.com";

const CUENTAS: { username: string; role: string }[] = [
  { username: "mzavaleta", role: "ADMIRA" },
  { username: "mzavaleta-fdm", role: "FDM" },
  { username: "mzavaleta-tecnico", role: "TECNICO" },
];

async function main() {
  for (const { username, role } of CUENTAS) {
    const existente = await prisma.user.findUnique({ where: { username } });
    if (existente) {
      console.warn(`⚠️  Ya existe un usuario "${username}" (rol ${existente.role}). Se salta.`);
      continue;
    }

    const passwordPlano = randomBytes(6).toString("base64url");

    const user = await prisma.user.create({
      data: {
        username,
        password: bcrypt.hashSync(passwordPlano, 10),
        role,
        name: NOMBRE,
        email: EMAIL,
        debeCambiarPassword: true,
      },
    });

    await registrarCredencial({
      usuario: user.username,
      nombre: user.name,
      rol: user.role,
      email: user.email,
      password: passwordPlano,
    });

    console.log(`Usuario creado: ${user.username} (${user.role}) / ${passwordPlano}`);
  }

  console.log("\nTendrán que cambiar la contraseña en su primer acceso (debeCambiarPassword=true).");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
