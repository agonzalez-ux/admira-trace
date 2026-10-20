import { prisma } from "../src/lib/prisma";

/**
 * Borra todos los tokens de un solo uso guardados en la base de datos:
 * enlaces del formulario de viabilidad (ViabilidadToken) y de restablecer
 * contraseña (PasswordResetToken). Los enlaces ya enviados dejan de
 * funcionar; los de viabilidad se pueden reenviar desde Admira.
 *
 * Uso (mismo patrón que el resto de scripts puntuales contra producción):
 *   docker build --target builder -t admira-builder-temp .
 *   docker run --rm \
 *     -v admira-trace_admira-db:/data -e DATABASE_URL="file:/data/admira-trace.db" \
 *     admira-builder-temp npx tsx scripts/borrar-tokens.ts
 *   docker rmi admira-builder-temp
 */
async function main() {
  const viabilidad = await prisma.viabilidadToken.deleteMany({});
  const reset = await prisma.passwordResetToken.deleteMany({});
  console.log(`ViabilidadToken borrados: ${viabilidad.count}`);
  console.log(`PasswordResetToken borrados: ${reset.count}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
