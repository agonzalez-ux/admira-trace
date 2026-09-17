import { randomBytes } from "crypto";
import { prisma } from "../src/lib/prisma";
import { hashViabilidadToken } from "../src/lib/viabilidad";

/**
 * Genera un enlace real (producción) al formulario de viabilidad, para que
 * el equipo lo vea desde cualquier ordenador antes de aprobarlo. Crea un
 * estanco e instalación claramente marcados como "PRUEBA" — hay que
 * borrarlos a mano después con scripts/borrar-demo-formulario-viabilidad.ts.
 *
 * Uso (mismo patrón que los demás scripts one-off contra producción):
 *   docker build --target builder -t admira-builder-temp .
 *   docker run --rm \
 *     -v admira-trace_admira-db:/data -e DATABASE_URL="file:/data/admira-trace.db" \
 *     admira-builder-temp npx tsx scripts/crear-demo-formulario-viabilidad.ts
 *   docker rmi admira-builder-temp
 */
async function main() {
  const estanco = await prisma.estanco.upsert({
    where: { idEstanco: "PRUEBA-FORMULARIO-VIABILIDAD" },
    update: {},
    create: {
      idEstanco: "PRUEBA-FORMULARIO-VIABILIDAD",
      nombre: "⚠️ PRUEBA — no es un estanco real",
      direccion: "Dato de prueba, borrar tras la demo",
      correoComercial: "prueba@admira.com",
    },
  });

  const incidencia = await prisma.incidencia.create({
    data: {
      tipo: "INSTALACION_NUEVA",
      titulo: '⚠️ PRUEBA — Pantalla LG 55" + soporte de pared (borrar)',
      estado: "PENDIENTE",
      estancoId: estanco.id,
      viabilidadEstado: "PENDIENTE_RESPUESTA",
    },
  });

  const token = randomBytes(32).toString("base64url");
  await prisma.viabilidadToken.create({
    data: {
      tokenHash: hashViabilidadToken(token),
      incidenciaId: incidencia.id,
      expiraAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });

  const base = process.env.APP_BASE_URL || "https://admiratrace.ieu.ai";
  console.log(`\nLink de demo (real, un solo uso):\n${base}/formulario-viabilidad?token=${token}\n`);
  console.log(`Incidencia de prueba: ${incidencia.id} (borrar con scripts/borrar-demo-formulario-viabilidad.ts)`);
}

main().finally(() => prisma.$disconnect());
