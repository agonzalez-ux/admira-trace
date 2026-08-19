"use client";

import { useEffect, useMemo, useState } from "react";
import { TIPO_MATERIAL_LABELS, ESTADO_MATERIAL_LABELS } from "@/lib/constants";
import { etiquetaTipo } from "@/lib/materialLabel";

type Material = {
  id: string;
  numeroSerie: string;
  tipo: string;
  tipoPersonalizado: string | null;
  nombre: string;
  estado: string;
  tecnico: { id: string; name: string; zona: string | null } | null;
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

type Filtro = "TODOS" | "EN_FDM" | "EN_ADMIRA" | "INSTALADO" | "TECNICO";

const FILTROS: { key: Filtro; label: string }[] = [
  { key: "TODOS", label: "Todo" },
  { key: "EN_FDM", label: "Almacén FDM" },
  { key: "EN_ADMIRA", label: "Almacén Admira" },
  { key: "INSTALADO", label: "Material instalado" },
  { key: "TECNICO", label: "Por técnico" },
];

/**
 * Chips de totales por tipo. Al hacer clic en uno se filtra la lista a solo ese
 * tipo (clic de nuevo para quitar el filtro).
 */
function TotalesChips({
  materiales,
  tipoActivo,
  onTipoClick,
}: {
  materiales: Material[];
  tipoActivo?: string | null;
  onTipoClick?: (tipo: string) => void;
}) {
  const totales = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of materiales) map.set(m.tipo, (map.get(m.tipo) || 0) + 1);
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [materiales]);

  if (totales.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 mb-3">
      {totales.map(([tipo, count]) => {
        const activo = tipoActivo === tipo;
        const label = `${count} ${TIPO_MATERIAL_LABELS[tipo as keyof typeof TIPO_MATERIAL_LABELS] || tipo}`;
        if (!onTipoClick) {
          return (
            <span key={tipo} className="text-xs font-medium bg-admira-50 text-admira-700 rounded-full px-3 py-1">
              {label}
            </span>
          );
        }
        return (
          <button
            key={tipo}
            onClick={() => onTipoClick(tipo)}
            className={`text-xs font-medium rounded-full px-3 py-1 transition-colors ${
              activo ? "bg-admira-600 text-white" : "bg-admira-50 text-admira-700 hover:bg-admira-100"
            }`}
            title={activo ? "Quitar filtro" : `Ver solo ${label}`}
          >
            {label}
            {activo && " ✕"}
          </button>
        );
      })}
      <span className="text-xs font-medium bg-slate-100 text-slate-600 rounded-full px-3 py-1">
        Total: {materiales.length}
      </span>
    </div>
  );
}

function MaterialCard({ m }: { m: Material }) {
  return (
    <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-3 flex items-center justify-between">
      <div>
        <div className="font-mono text-xs text-slate-500">S/N: {m.numeroSerie}</div>
        <div className="text-sm font-medium text-slate-800">
          {etiquetaTipo(m)} · {m.nombre}
        </div>
      </div>
      <span className={`text-[11px] rounded-full px-2 py-1 whitespace-nowrap ${ESTADO_COLORS[m.estado] || "bg-slate-100"}`}>
        {ESTADO_MATERIAL_LABELS[m.estado as keyof typeof ESTADO_MATERIAL_LABELS] || m.estado}
      </span>
    </div>
  );
}

export default function MaterialOverview() {
  const [materiales, setMateriales] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState<Filtro>("TODOS");
  const [tipoFiltro, setTipoFiltro] = useState<string | null>(null);
  const [tipoPorTecnico, setTipoPorTecnico] = useState<Record<string, string | null>>({});

  useEffect(() => {
    fetch("/api/materiales")
      .then((r) => r.json())
      .then((d) => {
        setMateriales(d.materiales || []);
        setLoading(false);
      });
  }, []);

  const baseFiltered =
    filtro === "TODOS"
      ? materiales
      : filtro === "EN_FDM"
        ? materiales.filter((m) => m.estado === "EN_FDM")
        : filtro === "EN_ADMIRA"
          ? materiales.filter((m) => m.estado === "EN_ADMIRA")
          : filtro === "INSTALADO"
            ? materiales.filter((m) => m.estado === "INSTALADO")
            : [];

  const flatFiltered = tipoFiltro ? baseFiltered.filter((m) => m.tipo === tipoFiltro) : baseFiltered;

  const porTecnico = useMemoGroupByTecnico(materiales);

  if (loading) return <p className="text-sm text-slate-400 py-4">Cargando material…</p>;

  return (
    <div>
      <div className="flex gap-2 flex-wrap mb-3">
        {FILTROS.map((f) => (
          <button
            key={f.key}
            onClick={() => {
              setFiltro(f.key);
              setTipoFiltro(null);
            }}
            className={`text-xs font-medium rounded-full px-3 py-1.5 transition-colors ${
              filtro === f.key ? "bg-admira-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {filtro !== "TECNICO" && (
        <>
          <TotalesChips
            materiales={baseFiltered}
            tipoActivo={tipoFiltro}
            onTipoClick={(tipo) => setTipoFiltro((prev) => (prev === tipo ? null : tipo))}
          />
          <div className="space-y-2">
            {flatFiltered.length === 0 && <p className="text-sm text-slate-400 py-6 text-center">No hay material.</p>}
            {flatFiltered.map((m) => (
              <MaterialCard key={m.id} m={m} />
            ))}
          </div>
        </>
      )}

      {filtro === "TECNICO" && (
        <div className="space-y-4">
          {porTecnico.length === 0 && <p className="text-sm text-slate-400 py-6 text-center">Ningún técnico tiene material en su poder.</p>}
          {porTecnico.map(({ tecnico, items }) => {
            const tipoActivo = tipoPorTecnico[tecnico.id] || null;
            const visibles = tipoActivo ? items.filter((m) => m.tipo === tipoActivo) : items;
            return (
              <div key={tecnico.id} className="bg-white rounded-xl border border-slate-100 shadow-sm p-3">
                <div className="font-semibold text-slate-800 mb-2">
                  {tecnico.name}
                  {tecnico.zona && <span className="text-xs font-normal text-slate-400"> · {tecnico.zona}</span>}
                </div>
                <TotalesChips
                  materiales={items}
                  tipoActivo={tipoActivo}
                  onTipoClick={(tipo) =>
                    setTipoPorTecnico((prev) => ({ ...prev, [tecnico.id]: prev[tecnico.id] === tipo ? null : tipo }))
                  }
                />
                <div className="space-y-2">
                  {visibles.map((m) => (
                    <MaterialCard key={m.id} m={m} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function useMemoGroupByTecnico(materiales: Material[]) {
  return useMemo(() => {
    const groups = new Map<string, { tecnico: { id: string; name: string; zona: string | null }; items: Material[] }>();
    for (const m of materiales) {
      if (m.estado !== "EN_TECNICO" || !m.tecnico) continue;
      const g = groups.get(m.tecnico.id);
      if (g) g.items.push(m);
      else groups.set(m.tecnico.id, { tecnico: m.tecnico, items: [m] });
    }
    return Array.from(groups.values()).sort((a, b) => a.tecnico.name.localeCompare(b.tecnico.name));
  }, [materiales]);
}
