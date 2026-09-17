import { PrismaClient } from "@prisma/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";
import { createClient } from "@libsql/client";

/**
 * Borra el material, envíos e incidencias de prueba/semilla, dejando intactas
 * las 133 incidencias reales importadas del desk. No toca los usuarios (ni
 * los técnicos reales ni las cuentas demo de login).
 */
async function main() {
  const libsql = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!,
  });
  const prisma = new PrismaClient({ adapter: new PrismaLibSQL(libsql) });

  // Incidencias manuales de prueba (y todo lo que cuelga de ellas).
  const incidenciasDemo = await prisma.incidencia.findMany({ where: { origen: "MANUAL" } });
  const idsIncidencias = incidenciasDemo.map((i) => i.id);
  if (idsIncidencias.length > 0) {
    await prisma.notificacionComercial.deleteMany({ where: { incidenciaId: { in: idsIncidencias } } });
    await prisma.fotoEvidencia.deleteMany({ where: { incidenciaId: { in: idsIncidencias } } });
    await prisma.incidenciaMaterial.deleteMany({ where: { incidenciaId: { in: idsIncidencias } } });
    const r = await prisma.incidencia.deleteMany({ where: { id: { in: idsIncidencias } } });
    console.log("Incidencias de prueba borradas:", r.count);
  }

  // Envíos de prueba (y sus items).
  const envios = await prisma.envio.findMany();
  const idsEnvios = envios.map((e) => e.id);
  if (idsEnvios.length > 0) {
    await prisma.envioItem.deleteMany({ where: { envioId: { in: idsEnvios } } });
    const r = await prisma.envio.deleteMany({ where: { id: { in: idsEnvios } } });
    console.log("Envíos de prueba borrados:", r.count);
  }

  // Material de prueba (y su histórico de eventos).
  const materiales = await prisma.material.findMany();
  const idsMateriales = materiales.map((m) => m.id);
  if (idsMateriales.length > 0) {
    await prisma.materialEvento.deleteMany({ where: { materialId: { in: idsMateriales } } });
    const r = await prisma.material.deleteMany({ where: { id: { in: idsMateriales } } });
    console.log("Material de prueba borrado:", r.count);
  }

  const restantes = await prisma.incidencia.count();
  console.log("Incidencias que quedan (reales, del desk):", restantes);
}

main().catch(console.error);
