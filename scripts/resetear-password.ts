import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { prisma } from "../src/lib/prisma";
import { registrarCredencial } from "../src/lib/credencialesVault";

/**
 * Resetea la contraseña de una o varias cuentas ya existentes (por
 * username) — para cuando hace falta dar acceso a alguien y no hay una
 * contraseña vigente guardada en el vault (cuenta anterior a
 * credencialesVault.ts, o vault incompleto). Reutilizable: versión
 * parametrizada de resetear-passwords-staff.ts.
 *
 * ⚠️ ACCIÓN REAL: invalida la contraseña actual de cada cuenta. Queda con
 * debeCambiarPassword=true, así que tendrán que cambiarla en su próximo
 * acceso. No ejecutar sin haber confirmado que es lo que se quiere.
 *
 * Uso (mismo patrón que el resto de scripts one-off contra producción):
 *   docker build --target builder -t admira-builder-temp .
 *   docker run --rm \
 *     -v admira-trace_admira-db:/data -e DATABASE_URL="file:/data/admira-trace.db" \
 *     -v /data/secreto:/data/secreto -e SECRETO_DIR=/data/secreto \
 *     admira-builder-temp npx tsx scripts/resetear-password.ts usuario1 usuario2
 *   docker rmi admira-builder-temp
 */
const usernames = process.argv.slice(2);

async function main() {
  if (usernames.length === 0) {
    console.error("Uso: npx tsx scripts/resetear-password.ts usuario1 [usuario2 ...]");
    process.exit(1);
  }

  for (const username of usernames) {
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

    console.log(`${user.username} (${user.role}, ${user.name})\t${passwordPlano}`);
  }

  console.log("\nHecho. Comunica estas contraseñas para que las cambien en su próximo acceso.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
