import { ejecutarOrdenesRecurrentesPendientes } from "./ordenesRecurrentes";
import { syncDeskTickets } from "./desk";
import { syncHardwareDesconectado } from "./hardwareSync";

/**
 * Comprobaciones periódicas: órdenes de envío recurrente y sincronización de
 * incidencias con el desk.
 *
 * Se arrancan de forma perezosa la primera vez que se llama a
 * `iniciarScheduler()` desde una ruta de API (que siempre corre en Node). No
 * se usa `instrumentation.ts` porque Next.js lo compila también para el edge
 * runtime, donde las dependencias de Node (net/http/https vía googleapis)
 * no existen.
 *
 * Requiere un servidor Node persistente. Si algún día se despliega en
 * Vercel/Lambda, habría que sustituirlo por un cron externo que llame a
 * POST /api/ordenes-recurrentes/ejecutar y a un endpoint equivalente para
 * la sincronización del desk.
 */
const INTERVALO_ORDENES_MS = 60 * 60 * 1000; // cada hora
const INTERVALO_DESK_MS = 2 * 60 * 60 * 1000; // cada 2 horas

declare global {
  var __admiraSchedulerIniciado: boolean | undefined;
}

async function ejecutarOrdenes() {
  try {
    const { generados, detalles } = await ejecutarOrdenesRecurrentesPendientes();
    if (generados > 0) {
      console.log(`[ordenes-recurrentes] ${generados} envío(s) generado(s) automáticamente.`);
      for (const d of detalles) console.log(`  ${d}`);
    }
  } catch (err) {
    console.error("[ordenes-recurrentes] Error en la comprobación periódica:", err);
  }
}

// Antes las incidencias solo se sincronizaban con el desk cuando alguien de
// Admira tenía la pestaña abierta (al cargar GET /api/incidencias). Si nadie
// entraba durante horas, los tickets nuevos/actualizados del desk no
// aparecían hasta que alguien abriera la app. Con esto se mantienen al día
// solas cada 2 horas, haya alguien mirando o no.
async function ejecutarSyncDesk() {
  try {
    const { nuevas, actualizadas } = await syncDeskTickets();
    console.log(`[desk-scheduler] Sincronización periódica: ${nuevas} nueva(s), ${actualizadas} actualizada(s).`);
  } catch (err) {
    console.error("[desk-scheduler] Error en la sincronización periódica de incidencias:", err);
  }
  try {
    await syncHardwareDesconectado();
  } catch (err) {
    console.error("[desk-scheduler] Error sincronizando pantallas desconectadas:", err);
  }
}

export function iniciarScheduler() {
  // El flag va en `globalThis` para que el hot-reload de desarrollo no arranque
  // un intervalo nuevo en cada recarga de módulo.
  if (globalThis.__admiraSchedulerIniciado) return;
  globalThis.__admiraSchedulerIniciado = true;

  setTimeout(ejecutarOrdenes, 15_000);
  setInterval(ejecutarOrdenes, INTERVALO_ORDENES_MS);
  console.log("[ordenes-recurrentes] Comprobación periódica activada (cada hora).");

  setTimeout(ejecutarSyncDesk, 20_000);
  setInterval(ejecutarSyncDesk, INTERVALO_DESK_MS);
  console.log("[desk-scheduler] Sincronización periódica de incidencias activada (cada 2 horas).");
}
