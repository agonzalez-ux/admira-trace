import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { prisma } from "../src/lib/prisma";
import { registrarCredencial } from "../src/lib/credencialesVault";

/**
 * Resetea la contraseña de las cuentas de staff que nunca tuvieron su
 * contraseña real guardada en ningún sitio (se crearon fuera del repo, antes
 * de que existiera credencialesVault.ts) — es la única forma de que la
 * bóveda "Secreto/" quede completa desde el primer backup.
 *
 * ⚠️ ACCIÓN REAL sobre cuentas de gente del equipo: cada una queda con
 * debeCambiarPassword=true (como en su alta original) y tendrá que volver a
 * cambiar su contraseña al entrar. NO ejecutar sin confirmación explícita.
 *
 * Uso (mismo patrón que el resto de scripts one-off contra producción, ver
 * memoria de despliegue "Running one-off scripts against the live production DB"):
 *   docker build --target builder -t admira-builder-temp .
 *   docker run --rm \
 *     -v <volumen-db>:/data -e DATABASE_URL="file:/data/admira-trace.db" \
 *     -v <host-secreto>:/data-secreto -e SECRETO_DIR=/data-secreto \
 *     admira-builder-temp npx tsx scripts/resetear-passwords-staff.ts
 *   docker rmi admira-builder-temp
 */
const USUARIOS = ["mgalera", "erincon", "acamargo", "jparada", "admira", "fdm"];

async function main() {
  for (const username of USUARIOS) {
    const user = await prisma.user.findUnique({ where: { username } });
    if (!user) {
      console.warn(`⚠️  No existe el usuario "${username}", se salta.`);
      continue;
    }

    const passwordPlano = randomBytes(6).toString("base64url");
    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: bcrypt.hashSync(passwordPlano, 10),
        debeCambiarPassword: true,
        passwordCambiadaAt: null,
      },
    });

    await registrarCredencial({
      usuario: user.username,
      nombre: user.name,
      rol: user.role,
      email: user.email,
      password: passwordPlano,
    });

    console.log(`${user.username}\t${passwordPlano}`);
  }

  console.log("\nHecho. Comunica estas contraseñas a cada persona para que las cambien en su primer acceso.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
