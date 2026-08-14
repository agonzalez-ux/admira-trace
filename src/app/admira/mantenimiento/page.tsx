import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import CleanupPanel from "@/components/admin/CleanupPanel";

export default async function AdminMantenimiento() {
  const session = await getSession();
  if (!session || session.role !== "ADMIRA") {
    redirect("/");
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">🔧 Mantenimiento del sistema</h1>
          <p className="text-slate-600">Panel de control para tareas de limpieza y mantenimiento automático</p>
        </div>

        {/* Secciones de mantenimiento */}
        <div className="space-y-8">
          {/* Limpieza mensual */}
          <div className="bg-white rounded-xl shadow-lg p-6">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-slate-900 mb-1">📸 Limpieza de fotos</h2>
              <p className="text-sm text-slate-600">
                Gestión automática de las fotos de incidencias resueltas. Se hace copia de seguridad y se eliminan los
                originales para liberar espacio.
              </p>
            </div>
            <CleanupPanel />
          </div>

          {/* Información adicional */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-6">
            <h3 className="font-semibold text-amber-900 mb-3">ℹ️ Cómo funciona</h3>
            <ul className="text-sm text-amber-800 space-y-2">
              <li>
                <strong>Automático:</strong> Cada primer lunes del mes a las 00:00 se ejecuta automáticamente
              </li>
              <li>
                <strong>Backup:</strong> Las fotos se copian a <code className="bg-amber-100 px-2 py-1 rounded">/data/backups/fotos-YYYY-MM/</code>
              </li>
              <li>
                <strong>Retención:</strong> Se guardan los backups de los últimos 12 meses
              </li>
              <li>
                <strong>Manual:</strong> Puedes ejecutar la limpieza cuando quieras usando el botón de arriba
              </li>
              <li>
                <strong>Auditoría:</strong> Cada limpieza queda registrada para poder revisar qué se borró
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
