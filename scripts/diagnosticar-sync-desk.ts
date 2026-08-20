/**
 * Diagnóstico de la sincronización con el desk: compara lo que hay en la
 * base de datos (Incidencia origen DESK) con lo que devuelve el desk
 * directamente, para detectar tickets in situ activos que existen en el
 * desk pero no se han importado (o no se han actualizado) en la app.
 *
 * Uso: npx tsx scripts/diagnosticar-sync-desk.ts
 */
import { prisma } from "../src/lib/prisma";
import { DESK_ALTADIS_PROJECTS } from "../src/lib/deskConfig";

const DESK_API_BASE = process.env.DESK_API_BASE_URL || "http://api.desk.admira.com/api";
const DESK_API_TOKEN = process.env.DESK_API_TOKEN;

type DeskTicket = {
  id: string;
  ticketName: string;
  subject: string;
  project: string;
  state_name: string;
  inserted: string;
  updated: string;
};

async function fetchAllInSituActivos(projectId: number): Promise<DeskTicket[]> {
  const tickets: DeskTicket[] = [];
  let page = 0;
  while (page < 50) {
    const params = new URLSearchParams({
      project: `[${projectId}]`,
      tokken: DESK_API_TOKEN || "",
      page: String(page),
      order: "",
      side: "true",
      performance: "2",
      state: "[1,2,3]",
    });
    const res = await fetch(`${DESK_API_BASE}/ticket/search?${params.toString()}`, {
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`Desk API respondió ${res.status}`);
    const { data, total } = await res.json();
    tickets.push(...data);
    if (tickets.length >= total || data.length === 0) break;
    page += 1;
  }
  return tickets;
}

async function main() {
  if (!DESK_API_TOKEN) {
    console.error("Falta DESK_API_TOKEN en el entorno.");
    return;
  }

  console.log("=== 10 incidencias DESK más recientes en la base de datos ===");
  const enBD = await prisma.incidencia.findMany({
    where: { origen: "DESK" },
    orderBy: { fechaImportada: "desc" },
    take: 10,
    select: { deskTicketId: true, titulo: true, deskEstado: true, fechaImportada: true, estancoId: true, estado: true },
  });
  for (const i of enBD) {
    console.log(
      `#${i.deskTicketId} · importada: ${i.fechaImportada.toISOString()} · desk: ${i.deskEstado} · app: ${i.estado} · estanco: ${i.estancoId ? "sí" : "NO"} · ${i.titulo}`
    );
  }

  console.log("\n=== Comparando contra el desk en directo (in situ, activos) ===");
  const deskIdsEnBD = new Set(
    (await prisma.incidencia.findMany({ where: { origen: "DESK" }, select: { deskTicketId: true } })).map(
      (i) => i.deskTicketId
    )
  );

  const todosDesk: (DeskTicket & { proyecto: string })[] = [];
  for (const proyecto of DESK_ALTADIS_PROJECTS) {
    try {
      const tickets = await fetchAllInSituActivos(proyecto.id);
      for (const t of tickets) todosDesk.push({ ...t, proyecto: proyecto.name });
    } catch (e: any) {
      console.error(`[${proyecto.name}] ERROR consultando el desk: ${e.message}`);
    }
  }

  const faltantes = todosDesk.filter((t) => !deskIdsEnBD.has(String(t.id)));
  faltantes.sort((a, b) => new Date(b.inserted).getTime() - new Date(a.inserted).getTime());

  console.log(`\nTickets in situ activos en el desk: ${todosDesk.length}`);
  console.log(`Ya existen como Incidencia en la app: ${todosDesk.length - faltantes.length}`);
  console.log(`FALTAN en la app (nunca se importaron): ${faltantes.length}`);
  for (const t of faltantes.slice(0, 20)) {
    console.log(`  FALTA #${t.id} · ${t.proyecto} · creado: ${t.inserted} · ${t.subject || t.ticketName}`);
  }
}

main()
  .catch((e) => console.error("ERROR FATAL:", e))
  .finally(() => prisma.$disconnect());
