/**
 * Next.js instrumentation file: se ejecuta cuando inicia la aplicación.
 * Aquí inicializamos los scheduler y servicios que deben correr en background.
 */

let cleanupSchedulerInitialized = false;

export async function register() {
  // Solo ejecutar en el servidor (no en el navegador)
  if (typeof window !== "undefined") return;

  if (!cleanupSchedulerInitialized) {
    cleanupSchedulerInitialized = true;

    // Programar la limpieza mensual
    console.log("[instrumentation] Inicializando scheduler de limpieza mensual...");

    try {
      const { initMonthlyCleanupScheduler } = await import("@/lib/cleanupScheduler");
      await initMonthlyCleanupScheduler();
      console.log("[instrumentation] ✅ Scheduler inicializado correctamente");
    } catch (err) {
      console.error("[instrumentation] ❌ Error inicializando scheduler:", err);
    }
  }
}
