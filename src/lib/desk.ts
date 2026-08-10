import { prisma } from "./prisma";
import { DESK_ALTADIS_PROJECTS } from "./deskConfig";
import { syncToSheets } from "./googleSheets";
import { matchEstanco } from "./estancoMatch";

const DESK_API_BASE = process.env.DESK_API_BASE_URL || "http://api.desk.admira.com/api";
const DESK_API_TOKEN = process.env.DESK_API_TOKEN;

// Estados del desk que consideramos "activos" (no resueltos): 1=Abierto, 2=Pendiente, 3=En espera.
// performance=2 => "Asistencia Admira in situ" (requiere desplazamiento físico de un técnico).
const ESTADOS_ACTIVOS = [1, 2, 3];
const PERFORMANCE_IN_SITU = 2;

type DeskTicket = {
  id: string;
  ticketName: string;
  subject: string;
  project: string;
  state: string;
  state_name: string;
  type_detail_name: string | null;
  priority_name: string | null;
  performance_name: string | null;
  inserted: string;
  updated: string;
};

type DeskSearchResponse = {
  total: number;
  data: DeskTicket[];
};

async function fetchTicketsPage(projectId: number, page: number): Promise<DeskSearchResponse> {
  const params = new URLSearchParams({
    project: `[${projectId}]`,
    tokken: DESK_API_TOKEN || "",
    page: String(page),
    order: "",
    side: "true",
    performance: String(PERFORMANCE_IN_SITU),
    state: `[${ESTADOS_ACTIVOS.join(",")}]`,
  });
  const res = await fetch(`${DESK_API_BASE}/ticket/search?${params.toString()}`, {
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Desk API respondió ${res.status} para el proyecto ${projectId}`);
  }
  const json = await res.json();
  if (!json || !Array.isArray(json.data)) {
    throw new Error(`Respuesta inesperada del desk para el proyecto ${projectId}`);
  }
  return json as DeskSearchResponse;
}

async function fetchAllActiveTickets(projectId: number): Promise<DeskTicket[]> {
  const tickets: DeskTicket[] = [];
  let page = 0;
  // Salvaguarda de páginas para no quedarnos en un bucle infinito ante una respuesta inesperada.
  const MAX_PAGES = 50;
  while (page < MAX_PAGES) {
    const { data, total } = await fetchTicketsPage(projectId, page);
    tickets.push(...data);
    if (tickets.length >= total || data.length === 0) break;
    page += 1;
  }
  return tickets;
}

export const DESK_CONFIGURED = Boolean(DESK_API_TOKEN);

let lastSyncAt = 0;
const MIN_SYNC_INTERVAL_MS = 60_000; // no más de una sincronización por minuto

/**
 * Importa como Incidencia (origen "DESK") los tickets activos que requieren
 * visita in situ en los proyectos Altadis configurados. No asigna técnico:
 * quedan en estado SIN_ASIGNAR hasta que Admira elige el técnico desde la app.
 * No se toca ninguna incidencia que ya tenga técnico asignado.
 */
export async function syncDeskTickets(force = false): Promise<{ nuevas: number; actualizadas: number }> {
  if (!DESK_CONFIGURED) return { nuevas: 0, actualizadas: 0 };

  const now = Date.now();
  if (!force && now - lastSyncAt < MIN_SYNC_INTERVAL_MS) {
    return { nuevas: 0, actualizadas: 0 };
  }
  lastSyncAt = now;

  let nuevas = 0;
  let actualizadas = 0;

  for (const proyecto of DESK_ALTADIS_PROJECTS) {
    // OJO: el parámetro "project" de /api/ticket/search espera el campo "id" del
    // listado de proyectos (/api/projects/all), no el "project_id" interno.
    const tickets = await fetchAllActiveTickets(proyecto.id);

    for (const t of tickets) {
      const deskTicketId = String(t.id);
      const existente = await prisma.incidencia.findUnique({ where: { deskTicketId } });

      const descripcionPartes = [
        t.type_detail_name ? `Tipo: ${t.type_detail_name}` : null,
        t.priority_name ? `Prioridad: ${t.priority_name}` : null,
        `Estado en el desk: ${t.state_name}`,
      ].filter(Boolean);

      if (!existente) {
        const match = await matchEstanco(t.ticketName || t.subject || "");
        await prisma.incidencia.create({
          data: {
            origen: "DESK",
            deskTicketId,
            deskProyecto: t.project,
            deskEstado: t.state_name,
            ticketExternoId: deskTicketId,
            titulo: t.subject || t.ticketName,
            descripcion: descripcionPartes.join(" · "),
            tipo: "REPARACION",
            cliente: t.project,
            direccion: t.ticketName,
            estado: "SIN_ASIGNAR",
            estancoId: match?.estancoId || null,
            estancoMatchConfianza: match?.confianza || null,
          },
        });
        nuevas += 1;
      } else if (existente.estado === "SIN_ASIGNAR" && existente.deskEstado !== t.state_name) {
        // Actualizamos datos de referencia mientras siga sin asignar; una vez asignada
        // no se vuelve a tocar automáticamente para no interferir con el trabajo del técnico.
        await prisma.incidencia.update({
          where: { id: existente.id },
          data: {
            deskEstado: t.state_name,
            descripcion: descripcionPartes.join(" · "),
          },
        });
        actualizadas += 1;
      }
    }
  }

  if (nuevas > 0 || actualizadas > 0) {
    await syncToSheets(["incidencias", "intervenciones"]);
  }

  return { nuevas, actualizadas };
}
