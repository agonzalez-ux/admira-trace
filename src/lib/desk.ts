import { prisma } from "./prisma";
import { DESK_ALTADIS_PROJECTS } from "./deskConfig";
import { syncToSheets } from "./googleSheets";
import { matchEstanco } from "./estancoMatch";
import { notificarEquipoAdmira } from "./notificaciones";

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

// Sin esto, si el desk se queda colgado en una sola página (red lenta, API
// bloqueada, etc.) toda la sincronización se queda esperando indefinidamente
// — el botón "Sincronizar con el desk ahora" se quedaba en "Sincronizando…"
// para siempre. Con esto, esa página falla a los 20s, el try/catch por
// proyecto en syncDeskTickets() la salta, y el resto de proyectos siguen.
const TIMEOUT_PETICION_DESK_MS = 20_000;

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
    signal: AbortSignal.timeout(TIMEOUT_PETICION_DESK_MS),
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

// Ventana de antigüedad para IMPORTAR tickets nuevos como Incidencia: por
// defecto, solo el último mes. El botón "Mostrar más" de la bandeja "Sin
// asignar" la va ampliando de 30 en 30 días para traer tickets más antiguos
// bajo demanda, en vez de importar de golpe todo el histórico activo del
// desk en cada sincronización automática. No afecta a las incidencias que
// ya existen: esas se siguen actualizando siempre, tengan la antigüedad que
// tengan.
const VENTANA_INICIAL_DIAS = 30;
const VENTANA_INCREMENTO_DIAS = 30;
let ventanaDiasActual = VENTANA_INICIAL_DIAS;

export function obtenerVentanaDeskDias(): number {
  return ventanaDiasActual;
}

/** Amplía la ventana de importación (la llama el botón "Mostrar más"). */
export function ampliarVentanaDeskDias(): number {
  ventanaDiasActual += VENTANA_INCREMENTO_DIAS;
  return ventanaDiasActual;
}

function dentroDeVentana(fechaInsertadaISO: string | undefined, dias: number): boolean {
  if (!fechaInsertadaISO) return true; // sin fecha: no descartamos por seguridad
  const fecha = new Date(fechaInsertadaISO);
  if (Number.isNaN(fecha.getTime())) return true;
  const limiteMs = Date.now() - dias * 24 * 60 * 60 * 1000;
  return fecha.getTime() >= limiteMs;
}

/**
 * Comprobación de seguridad además del parámetro `performance` ya enviado en
 * la petición: si el desk devolviera algún ticket que no sea de "Asistencia
 * Admira in situ" (p. ej. porque ignorase el filtro), no lo importamos como
 * Incidencia — esta app es para gestionar visitas físicas de técnicos, no
 * incidencias resueltas en remoto.
 */
function requiereTecnicoInSitu(t: DeskTicket): boolean {
  const nombre = (t.performance_name || "").toLowerCase();
  if (!nombre) return true; // sin dato: ya viene filtrado por el parámetro de la petición
  if (nombre.includes("in situ") || nombre.includes("presencial")) return true;
  if (nombre.includes("remot")) return false; // "remoto/a": no requiere desplazamiento físico
  return true; // valor desconocido: por precaución no lo descartamos
}

/**
 * Importa como Incidencia (origen "DESK") los tickets activos que requieren
 * visita in situ en los proyectos Altadis configurados. No asigna técnico:
 * quedan en estado SIN_ASIGNAR hasta que Admira elige el técnico desde la app.
 * No se toca ninguna incidencia que ya tenga técnico asignado.
 *
 * Los tickets NUEVOS (que aún no existen como Incidencia) solo se importan si
 * están dentro de `obtenerVentanaDeskDias()` días; los más antiguos se ignoran
 * hasta que se pulse "Mostrar más" y la ventana se amplíe.
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
  const ventanaDias = ventanaDiasActual;

  for (const proyecto of DESK_ALTADIS_PROJECTS) {
    try {
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
          if (!requiereTecnicoInSitu(t)) continue;
          if (!dentroDeVentana(t.inserted, ventanaDias)) continue;
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
        } else if (existente.estado === "SIN_ASIGNAR") {
          // Mientras siga sin asignar, además de refrescar el estado del desk,
          // reintentamos el emparejamiento con el directorio de estancos si
          // todavía no tiene uno: el emparejador ha ido mejorando con el tiempo
          // (títulos con formatos raros que antes no reconocía), así que un
          // ticket que se quedó sin vincular puede engancharse en una pasada
          // posterior sin tener que tocar nada a mano. Una vez asignada, no se
          // vuelve a tocar automáticamente para no interferir con el técnico.
          const cambioEstado = existente.deskEstado !== t.state_name;
          const necesitaReintentoEstanco = !existente.estancoId;
          if (!cambioEstado && !necesitaReintentoEstanco) continue;

          const match = necesitaReintentoEstanco ? await matchEstanco(t.ticketName || t.subject || "") : null;
          await prisma.incidencia.update({
            where: { id: existente.id },
            data: {
              deskEstado: t.state_name,
              descripcion: descripcionPartes.join(" · "),
              ...(match ? { estancoId: match.estancoId, estancoMatchConfianza: match.confianza } : {}),
            },
          });
          actualizadas += 1;
        }
      }
    } catch (err) {
      // Si un proyecto falla (timeout, error del desk, etc.) no debe impedir que
      // se sincronicen los demás: antes un solo fallo cortaba el bucle entero y
      // dejaba sin sincronizar todos los proyectos siguientes en esa pasada.
      console.error(`[desk-sync] Error sincronizando el proyecto "${proyecto.name}" (id ${proyecto.id}):`, err);
    }
  }

  if (nuevas > 0 || actualizadas > 0) {
    await syncToSheets(["incidencias", "intervenciones"]);
  }

  if (nuevas > 0) {
    await notificarEquipoAdmira({
      tipo: "INCIDENCIAS_DESK_NUEVAS",
      titulo: nuevas === 1 ? "1 ticket nuevo del desk" : `${nuevas} tickets nuevos del desk`,
      mensaje: "Requieren visita in situ y están sin técnico asignado.",
    });
  }

  return { nuevas, actualizadas };
}
