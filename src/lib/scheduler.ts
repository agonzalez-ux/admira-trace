import { ejecutarOrdenesRecurrentesPendientes } from "./ordenesRecurrentes";

/**
 * Comprobación periódica de órdenes de envío recurrente.
 *
 * Se arranca de forma perezosa la primera vez que se llama a `iniciarScheduler()`
 * desde una ruta de API (que siempre corre en Node). No se usa
 * `instrumentation.ts` porque Next.js lo compila también para el edge runtime,
 * donde las dependencias de Node (net/http/https vía googleapis) no existen.
 *
 * Requiere un servidor Node persistente. Si algún día se despliega en
 * Vercel/Lambda, habría que sustituirlo por un cron externo que llame a
 * POST /api/ordenes-recurrentes/ejecutar.
 */
const INTERVALO_MS = 60 * 60 * 1000; // cada hora

declare global {
  var __admiraSchedulerIniciado: boolean | undefined;
}

async function ejecutar() {
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

export function iniciarScheduler() {
  // El flag va en `globalThis` para que el hot-reload de desarrollo no arranque
  // un intervalo nuevo en cada recarga de módulo.
  if (globalThis.__admiraSchedulerIniciado) return;
  globalThis.__admiraSchedulerIniciado = true;

  setTimeout(ejecutar, 15_000);
  setInterval(ejecutar, INTERVALO_MS);
  console.log("[ordenes-recurrentes] Comprobación periódica activada (cada hora).");
}
