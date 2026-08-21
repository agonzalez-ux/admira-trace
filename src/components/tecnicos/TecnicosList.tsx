"use client";

import { useEffect, useMemo, useState } from "react";
import TecnicoFichaModal from "./TecnicoFichaModal";
import { useProyecto } from "@/lib/proyectoContext";
import { PROYECTO_LABELS } from "@/lib/constants";

type Tecnico = {
  id: string;
  name: string;
  zona: string | null;
  direccion: string | null;
  phone: string | null;
  email: string | null;
  username: string;
  personaContacto: string | null;
  radioCobertura: string | null;
  numMaterialDisponible: number;
  numIncidenciasPendientes: number;
};

export default function TecnicosList() {
  const { proyecto, activo } = useProyecto();
  const [tecnicos, setTecnicos] = useState<Tecnico[]>([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [direccionRef, setDireccionRef] = useState("");
  const [seleccionado, setSeleccionado] = useState<string | null>(null);
  const [sinActividadEnProyecto, setSinActividadEnProyecto] = useState(false);

  useEffect(() => {
    setLoading(true);
    const url = activo ? `/api/tecnicos?proyecto=${proyecto}` : "/api/tecnicos";
    fetch(url)
      .then((r) => r.json())
      .then((d) => {
        setTecnicos(d.tecnicos || []);
        setSinActividadEnProyecto(Boolean(d.sinActividadEnProyecto));
        setLoading(false);
      });
  }, [activo, proyecto]);

  const visibles = useMemo(() => {
    let lista = tecnicos;
    if (busqueda.trim()) {
      const q = busqueda.trim().toLowerCase();
      lista = lista.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          (t.email || "").toLowerCase().includes(q) ||
          (t.zona || "").toLowerCase().includes(q) ||
          (t.personaContacto || "").toLowerCase().includes(q)
      );
    }

    if (direccionRef.trim()) {
      const q = direccionRef.trim().toLowerCase();
      const tokens = q.split(/[\s,]+/).filter(Boolean);
      const puntua = (t: Tecnico) => {
        const texto = `${t.direccion || ""} ${t.zona || ""}`.toLowerCase();
        return tokens.reduce((acc, tok) => acc + (texto.includes(tok) ? 1 : 0), 0);
      };
      lista = [...lista].sort((a, b) => puntua(b) - puntua(a));
    }

    return lista;
  }, [tecnicos, busqueda, direccionRef]);

  if (loading) return <p className="text-sm text-slate-400 py-4">Cargando técnicos…</p>;

  const hayCoincidenciaDireccion = direccionRef.trim().length > 0;

  return (
    <div>
      {activo && sinActividadEnProyecto && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
          Ningún técnico tiene actividad todavía en {PROYECTO_LABELS[proyecto]} — mostrando el listado completo.
        </p>
      )}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 mb-3 space-y-3">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Buscar técnico por nombre</label>
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Ej. Carlos, Laura…"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">
            Dirección de la instalación (para ver qué técnico está más cerca)
          </label>
          <input
            value={direccionRef}
            onChange={(e) => setDireccionRef(e.target.value)}
            placeholder="Ej. Calle Betis, Sevilla"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          {hayCoincidenciaDireccion && (
            <p className="text-[11px] text-slate-400 mt-1">
              Ordenado por coincidencia de zona / dirección con lo escrito.
            </p>
          )}
        </div>
      </div>

      <div className="space-y-2">
        {visibles.length === 0 && <p className="text-sm text-slate-400 py-6 text-center">No hay técnicos que coincidan.</p>}
        {visibles.map((t, idx) => (
          <button
            key={t.id}
            onClick={() => setSeleccionado(t.id)}
            className="w-full text-left bg-white rounded-xl border border-slate-100 shadow-sm p-3 flex items-center justify-between gap-2 hover:border-admira-300 transition-colors"
          >
            <div className="min-w-0">
              <div className="font-medium text-slate-800 flex items-center gap-2 min-w-0">
                <span className="truncate">{t.name}</span>
                {hayCoincidenciaDireccion && idx === 0 && (
                  <span className="text-[10px] bg-emerald-100 text-emerald-700 rounded-full px-2 py-0.5 shrink-0">Más cercano</span>
                )}
              </div>
              <div className="text-xs text-slate-500 truncate">
                @{t.username} {t.zona ? `· ${t.zona}` : ""} {t.phone ? `· ${t.phone}` : ""}
              </div>
              {t.email && <div className="text-xs text-slate-500 truncate">✉️ {t.email}</div>}
              {t.personaContacto && <div className="text-[11px] text-slate-400 truncate">Contacto: {t.personaContacto}</div>}
              {t.direccion && <div className="text-xs text-slate-400 truncate">{t.direccion}</div>}
              {t.radioCobertura && (
                <div className="text-[11px] text-slate-400 truncate">Cobertura sin coste: {t.radioCobertura}</div>
              )}
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              <span className="text-[11px] bg-admira-50 text-admira-700 rounded-full px-2 py-1">
                {t.numMaterialDisponible} material
              </span>
              <span className="text-[11px] bg-amber-50 text-amber-700 rounded-full px-2 py-1">
                {t.numIncidenciasPendientes} incidencias pendientes
              </span>
            </div>
          </button>
        ))}
      </div>

      {seleccionado && <TecnicoFichaModal tecnicoId={seleccionado} onClose={() => setSeleccionado(null)} />}
    </div>
  );
}
