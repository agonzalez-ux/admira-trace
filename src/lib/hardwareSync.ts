import { google } from "googleapis";
import { prisma } from "./prisma";
import { syncToSheets } from "./googleSheets";

const CLIENT_EMAIL = process.env.GOOGLE_SHEETS_CLIENT_EMAIL;
const PRIVATE_KEY = process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\\n/g, "\n");

// El "Informe Incidencias Automatizado" real de Admira: la pestaña "Datos
// crudos Importados" lista las pantallas actualmente desconectadas.
const SPREADSHEET_ID = "1Ek687rzxylX_TZtikcG4pyzNLOgsg1huLe4uczFASPE";
const TAB = "Datos crudos Importados";

// Prefijo para el identificador único de estas incidencias (guardado en
// deskTicketId, aunque no vengan del desk, para reutilizar su índice único
// sin tener que migrar el esquema). Evita chocar con IDs reales del desk,
// que son puramente numéricos.
const PREFIJO_ID = "HW-";

export const HARDWARE_SYNC_CONFIGURADO = Boolean(CLIENT_EMAIL && PRIVATE_KEY);

let ultimaSync = 0;
const MIN_INTERVALO_MS = 60_000; // como mucho 1 vez por minuto

type FilaHardware = {
  idEstanco: string;
  referencia: string;
  nombreDescriptivo: string;
  provincia: string;
  estado: string;
  tipoIncidencia: string;
  statusTime: string;
  hardware: string;
};

function limpiar(v: unknown): string {
  return typeof v === "string" ? v.trim() : v != null ? String(v).trim() : "";
}

async function leerFilas(): Promise<FilaHardware[]> {
  const auth = new google.auth.JWT({
    email: CLIENT_EMAIL,
    key: PRIVATE_KEY,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  const sheets = google.sheets({ version: "v4", auth });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `'${TAB}'!A2:J`,
  });
  const rows = res.data.values || [];
  return rows
    .map((r) => ({
      idEstanco: limpiar(r[0]),
      referencia: limpiar(r[1]),
      nombreDescriptivo: limpiar(r[2]),
      provincia: limpiar(r[3]),
      estado: limpiar(r[4]),
      tipoIncidencia: limpiar(r[5]),
      statusTime: limpiar(r[6]),
      hardware: limpiar(r[9]),
    }))
    .filter((f) => f.idEstanco && f.estado);
}

/**
 * Crea (o mantiene al día, mientras siga sin asignar) una Incidencia por cada
 * pantalla que el informe de monitorización marca como "Desconectado",
 * vinculándola directamente al estanco por su ID (no hace falta el
 * emparejador de texto: aquí el ID Estanco viene ya identificado).
 *
 * No se toca ninguna incidencia que ya tenga técnico asignado: una vez que
 * alguien la está gestionando, esta sincronización deja de tocarla.
 */
export async function syncHardwareDesconectado(force = false): Promise<{ nuevas: number; actualizadas: number }> {
  if (!HARDWARE_SYNC_CONFIGURADO) return { nuevas: 0, actualizadas: 0 };

  const ahora = Date.now();
  if (!force && ahora - ultimaSync < MIN_INTERVALO_MS) return { nuevas: 0, actualizadas: 0 };
  ultimaSync = ahora;

  const filas = await leerFilas();
  const desconectadas = filas.filter((f) => f.estado.toLowerCase() === "desconectado");

  let nuevas = 0;
  let actualizadas = 0;

  for (const f of desconectadas) {
    const deskTicketId = `${PREFIJO_ID}${f.idEstanco}`;
    const existente = await prisma.incidencia.findUnique({ where: { deskTicketId } });

    const estanco = await prisma.estanco.findUnique({ where: { idEstanco: f.idEstanco } });

    const descripcion = [
      f.tipoIncidencia ? `Motivo: ${f.tipoIncidencia}` : null,
      f.hardware ? `Hardware: ${f.hardware}` : null,
      f.statusTime ? `Desconectada desde: ${f.statusTime}` : null,
    ]
      .filter(Boolean)
      .join(" · ");

    if (!existente) {
      await prisma.incidencia.create({
        data: {
          origen: "HARDWARE",
          deskTicketId,
          deskProyecto: "Monitorización hardware",
          deskEstado: f.tipoIncidencia || f.estado,
          ticketExternoId: deskTicketId,
          titulo: `Pantalla desconectada · ${f.nombreDescriptivo || f.idEstanco}`,
          descripcion,
          tipo: "REPARACION",
          cliente: f.provincia || null,
          direccion: f.nombreDescriptivo || null,
          estado: "SIN_ASIGNAR",
          estancoId: estanco?.id || null,
          estancoMatchConfianza: estanco ? 1 : null,
        },
      });
      nuevas += 1;
    } else if (existente.estado === "SIN_ASIGNAR" && existente.deskEstado !== (f.tipoIncidencia || f.estado)) {
      await prisma.incidencia.update({
        where: { id: existente.id },
        data: {
          deskEstado: f.tipoIncidencia || f.estado,
          descripcion,
        },
      });
      actualizadas += 1;
    }
  }

  // Si una pantalla que había generado una incidencia SIN_ASIGNAR ya no
  // aparece como desconectada, se marca resuelta sola: probablemente se
  // reconectó antes de que nadie llegara a intervenir.
  const idsActivos = new Set(desconectadas.map((f) => `${PREFIJO_ID}${f.idEstanco}`));
  const abiertasHardware = await prisma.incidencia.findMany({
    where: { origen: "HARDWARE", estado: "SIN_ASIGNAR" },
    select: { id: true, deskTicketId: true },
  });
  const yaReconectadas = abiertasHardware.filter((i) => i.deskTicketId && !idsActivos.has(i.deskTicketId));
  if (yaReconectadas.length > 0) {
    await prisma.incidencia.updateMany({
      where: { id: { in: yaReconectadas.map((i) => i.id) } },
      data: { estado: "RESUELTA", fechaResuelta: new Date() },
    });
  }

  if (nuevas > 0 || actualizadas > 0 || yaReconectadas.length > 0) {
    await syncToSheets(["incidencias", "intervenciones"]);
  }

  return { nuevas, actualizadas };
}
