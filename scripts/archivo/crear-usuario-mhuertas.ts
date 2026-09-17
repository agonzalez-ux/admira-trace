import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { prisma } from "../src/lib/prisma";
import { registrarCredencial } from "../src/lib/credencialesVault";

/**
 * Alta de un nuevo usuario ADMIRA (acceso a todos los proyectos vía el
 * selector) para Mateo Huertas.
 *
 * Uso (mismo patrón que el resto de scripts one-off contra producción, ver
 * memoria de despliegue "Running one-off scripts against the live production DB"):
 *   docker build --target builder -t admira-builder-temp .
 *   docker run --rm \
 *     -v <volumen-db>:/data -e DATABASE_URL="file:/data/admira-trace.db" \
 *     -v <host-secreto>:/data-secreto -e SECRETO_DIR=/data-secreto \
 *     admira-builder-temp npx tsx scripts/crear-usuario-mhuertas.ts
 *   docker rmi admira-builder-temp
 */
const USERNAME = "mhuertas";
const NOMBRE = "Mateo Huertas";
const EMAIL = "mhuertas@admira.com";
const ROL = "ADMIRA";

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
