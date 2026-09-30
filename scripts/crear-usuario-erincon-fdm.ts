import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { prisma } from "../src/lib/prisma";
import { registrarCredencial } from "../src/lib/credencialesVault";

/**
 * Alta de la cuenta FDM de Edison Rincón — ya tiene la de ADMIRA (usuario
 * "erincon"); la app solo admite un rol por cuenta, así que es una cuenta
 * independiente (ver [[alta-usuarios-staff]]). Usuario "pruebafdm" a
 * petición expresa (en vez del patrón habitual "erincon-fdm").
 *
 * Uso (mismo patrón que el resto de scripts one-off contra producción):
 *   docker build --target builder -t admira-builder-temp .
 *   docker run --rm \
 *     -v admira-trace_admira-db:/data -e DATABASE_URL="file:/data/admira-trace.db" \
 *     -v /data/secreto:/data/secreto -e SECRETO_DIR=/data/secreto \
 *     admira-builder-temp npx tsx scripts/crear-usuario-erincon-fdm.ts
 *   docker rmi admira-builder-temp
 */
const USERNAME = "pruebafdm";
const NOMBRE = "Edison Rincón";
const EMAIL = "erincon@admira.com";
const ROL = "FDM";

async function main() {
  const existente = await prisma.user.findUnique({ where: { username: USERNAME } });
  if (existente) {
    console.error(`⚠️  Ya existe un usuario "${USERNAME}" (rol ${existente.role}). No se ha creado nada.`);
    process.exit(1);
  }

  const passwordPlano = randomBytes(6).toString("base64url");

  const user = await prisma.user.create({
    data: {
      username: USERNAME,
      password: bcrypt.hashSync(passwordPlano, 10),
      role: ROL,
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

  console.log(`Usuario creado: ${user.username} / ${passwordPlano}`);
  console.log("Tendrá que cambiarla en su primer acceso (debeCambiarPassword=true).");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
