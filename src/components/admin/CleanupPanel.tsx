"use client";

import { useState, useEffect } from "react";

interface CleanupStatus {
  proximoReset: {
    tiempoRestante: string;
    segundos: number;
  };
  historial: Array<{
    id: string;
    fecha: string;
    fotosMovidas: number;
    fotosEliminadas: number;
    backupsLimpiados: number;
    duracion: string;
    errores: number;
  }>;
}

export default function CleanupPanel() {
  const [status, setStatus] = useState<CleanupStatus | null>(null);
  const [ejecutando, setEjecutando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  // Cargar estado inicial
  useEffect(() => {
    cargarEstado();
    const intervalo = setInterval(cargarEstado, 30000); // Actualizar cada 30s
    return () => clearInterval(intervalo);
  }, []);

  async function cargarEstado() {
    try {
      const res = await fetch("/api/admin/cleanup");
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const data = await res.json();
      setStatus(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error cargando estado");
    } finally {
      setCargando(false);
    }
  }

  async function ejecutarAhora() {
    setEjecutando(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/cleanup", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error ejecutando limpieza");
      // Recargar estado inmediatamente
      await cargarEstado();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setEjecutando(false);
    }
  }

  if (cargando) {
    return (
      <div className="bg-slate-50 rounded-lg border border-slate-200 p-4">
        <p className="text-sm text-slate-500">Cargando estado...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Tarjeta de próximo reset */}
      {status && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="font-semibold text-blue-900 text-sm mb-2">⏰ Próxima limpieza automática</h3>
          <p className="text-2xl font-bold text-blue-700">{status.proximoReset.tiempoRestante}</p>
          <p className="text-xs text-blue-600 mt-1">
            El sistema ejecutará automáticamente la limpieza del primer lunes del mes a las 00:00
          </p>
        </div>
      )}

      {/* Botón ejecutar ahora */}
      <button
        onClick={ejecutarAhora}
        disabled={ejecutando}
        className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-400 text-white font-semibold py-2 px-4 rounded-lg transition"
      >
        {ejecutando ? "Ejecutando limpieza..." : "🧹 Ejecutar limpieza ahora"}
      </button>

      {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{error}</div>}

      {/* Historial de limpiezas */}
      {status && status.historial.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-semibold text-slate-900 text-sm">📜 Últimas 5 limpiezas</h3>
          <div className="space-y-1">
            {status.historial.map((log) => (
              <div key={log.id} className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs">
                <div className="flex justify-between items-start mb-1">
                  <span className="font-mono text-slate-600">{new Date(log.fecha).toLocaleString("es-ES")}</span>
                  <span className="text-slate-500">{log.duracion}</span>
                </div>
                <div className="flex gap-4 text-slate-600">
                  <span>📸 Movidas: {log.fotosMovidas}</span>
                  <span>🗑️ Eliminadas: {log.fotosEliminadas}</span>
                  <span>💾 Backups limpiados: {log.backupsLimpiados}</span>
                  {log.errores > 0 && <span className="text-red-600">⚠️ Errores: {log.errores}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {status && status.historial.length === 0 && (
        <p className="text-sm text-slate-500 italic">Sin historial de limpiezas todavía</p>
      )}
    </div>
  );
}
