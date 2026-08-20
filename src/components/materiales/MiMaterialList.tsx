"use client";

import { useEffect, useMemo, useState } from "react";
import { ESTADO_MATERIAL_LABELS, TIPO_MATERIAL_LABELS } from "@/lib/constants";
import { etiquetaTipo } from "@/lib/materialLabel";

type Material = {
  id: string;
  numeroSerie: string;
  tipo: string;
  tipoPersonalizado: string | null;
  nombre: string;
  imei: string | null;
  estado: string;
};

const ESTADO_COLORS: Record<string, string> = {
  EN_FDM: "bg-slate-100 text-slate-600",
  EN_ADMIRA: "bg-admira-100 text-admira-700",
  EN_TRANSITO_ENVIO: "bg-blue-100 text-blue-700",
  EN_TECNICO: "bg-emerald-100 text-emerald-700",
  EN_TRANSITO_RECOGIDA: "bg-amber-100 text-amber-700",
  INSTALADO: "bg-purple-100 text-purple-700",
  BAJA: "bg-red-100 text-red-700",
};

export default function MiMaterialList({ tecnicoId, tecnicoLabel }: { tecnicoId?: string; tecnicoLabel?: string }) {
  const [materiales, setMateriales] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [tipoFiltro, setTipoFiltro] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");

  useEffect(() => {
    const url = tecnicoId ? `/api/materiales?tecnicoId=${tecnicoId}` : "/api/materiales";
    fetch(url)
      .then((r) => r.json())
      .then((d) => {
        setMateriales(d.materiales || []);
        setLoading(false);
      });
  }, [tecnicoId]);

  const totales = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of materiales) map.set(m.tipo, (map.get(m.tipo) || 0) + 1);
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [materiales]);

  const visibles = useMemo(() => {
    let lista = tipoFiltro ? materiales.filter((m) => m.tipo === tipoFiltro) : materiales;
    const q = busqueda.trim().toLowerCase();
    if (q) {
      lista = lista.filter(
        (m) => m.nombre.toLowerCase().includes(q) || m.numeroSerie.toLowerCase().includes(q)
      );
    }
    return lista;
  }, [materiales, tipoFiltro, busqueda]);

  if (loading) return <p className="text-sm text-slate-400 py-4">Cargando material…</p>;

  return (
    <div>
      {tecnicoLabel && <div className="text-xs text-slate-500 mb-2">{tecnicoLabel}</div>}

      {materiales.length > 0 && (
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre o número de serie…"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm mb-3"
        />
      )}

      {totales.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {totales.map(([tipo, count]) => {
            const activo = tipoFiltro === tipo;
            return (
              <button
                key={tipo}
                onClick={() => setTipoFiltro(activo ? null : tipo)}
                className={`text-xs font-medium rounded-full px-3 py-1 transition-colors ${
                  activo ? "bg-admira-600 text-white" : "bg-admira-50 text-admira-700 hover:bg-admira-100"
                }`}
                title={activo ? "Quitar filtro" : "Ver solo esta categoría"}
              >
                {count} {TIPO_MATERIAL_LABELS[tipo as keyof typeof TIPO_MATERIAL_LABELS] || tipo}
                {activo && " ✕"}
              </button>
            );
          })}
          <span className="text-xs font-medium bg-slate-100 text-slate-600 rounded-full px-3 py-1">
            Total: {materiales.length}
          </span>
        </div>
      )}

      <div className="space-y-2">
        {visibles.length === 0 && (
          <p className="text-sm text-slate-400 py-6 text-center">
            {materiales.length === 0 ? "No hay material." : "Ningún material coincide con la búsqueda."}
          </p>
        )}
        {visibles.map((m) => (
          <div key={m.id} className="bg-white rounded-xl border border-slate-100 shadow-sm p-3 flex items-center justify-between">
            <div>
              <div className="font-mono text-xs text-slate-500">
                S/N: {m.numeroSerie}
                {m.imei && <span className="text-slate-400"> · IMEI: {m.imei}</span>}
              </div>
              <div className="text-sm font-medium text-slate-800">
                {etiquetaTipo(m)} · {m.nombre}
              </div>
            </div>
            <span className={`text-[11px] rounded-full px-2 py-1 whitespace-nowrap ${ESTADO_COLORS[m.estado] || "bg-slate-100"}`}>
              {ESTADO_MATERIAL_LABELS[m.estado as keyof typeof ESTADO_MATERIAL_LABELS] || m.estado}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
