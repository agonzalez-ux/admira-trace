import { PrismaClient } from "@prisma/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";
import { createClient } from "@libsql/client";

async function main() {
  const libsql = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!,
  });
  const prisma = new PrismaClient({ adapter: new PrismaLibSQL(libsql) });

  const materiales = await prisma.material.findMany({ orderBy: { createdAt: "asc" } });
  console.log("\n=== MATERIALES (" + materiales.length + ") ===");
  for (const m of materiales) {
    console.log(m.codigoBarras, "|", m.tipo, "|", m.nombre, "|", m.estado, "|", m.createdAt.toISOString());
  }

  const envios = await prisma.envio.findMany({ include: { items: true }, orderBy: { fechaCreacion: "asc" } });
  console.log("\n=== ENVIOS (" + envios.length + ") ===");
  for (const e of envios) {
    console.log(e.id, "|", e.tipo, "|", e.origen, "->", e.destino, "|", e.estado, "| items:", e.items.length);
  }

  const incidenciasManual = await prisma.incidencia.findMany({ where: { origen: "MANUAL" } });
  console.log("\n=== INCIDENCIAS MANUALES (" + incidenciasManual.length + ") ===");
  for (const i of incidenciasManual) {
    console.log(i.id, "|", i.titulo, "|", i.estado, "|", i.fechaImportada.toISOString());
  }

  const incidenciasDesk = await prisma.incidencia.count({ where: { origen: "DESK" } });
  console.log("\nIncidencias importadas del desk (reales):", incidenciasDesk);

  const porEstado = await prisma.incidencia.groupBy({ by: ["estado"], _count: true });
  console.log("\nIncidencias por estado:", JSON.stringify(porEstado));

  const usuariosPrueba = await prisma.user.findMany({
    where: { OR: [{ username: { contains: "prueba" } }, { username: { contains: "test" } }] },
  });
  console.log("\n=== USUARIOS QUE PARECEN DE PRUEBA (" + usuariosPrueba.length + ") ===");
  for (const u of usuariosPrueba) console.log(u.username, "|", u.role, "|", u.email);
}

main().catch(console.error);
