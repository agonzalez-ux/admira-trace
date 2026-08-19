"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  TIPO_MATERIAL_LABELS,
  ESTADO_INCIDENCIA_LABELS,
  TIPO_INCIDENCIA_LABELS,
  ESTADO_ENVIO_LABELS,
} from "@/lib/constants";
import OrdenesRecurrentes, { OrdenRecurrente } from "./OrdenesRecurrentes";
import IncidenciaDetalle, { IncidenciaDetalleData } from "@/components/incidencias/IncidenciaDetalle";

type Material = { id: string; numeroSerie: string; tipo: string; nombre: string };
type EnvioPendiente = {
  id: string;
  tipo: string;
  estado: string;
  transportista: string;
  fechaCreacion: string;
  items: { id: string; escaneadoOrigen: boolean; escaneadoDestino: boolean; material: Material }[];
};

type Detalle = {
  tecnico: {
    id: string;
    name: string;
    username: string;
    zona: string | null;
    direccion: string | null;
    phone: string | null;
    email: string | null;
    codigoPostal: string | null;
    personaContacto: string | null;
    horario: string | null;
    radioCobertura: string | null;
    costeKm: string | null;
    condiciones: string | null;
  };
  materiales: Material[];
  enviosPendientes: EnvioPendiente[];
  ordenesRecurrentes: OrdenRecurrente[];
  incidenciasPendientes: IncidenciaDetalleData[];
  historialIncidencias: IncidenciaDetalleData[];
};

const ESTADO_COLORS: Record<string, string> = {
  SIN_ASIGNAR: "bg-slate-200 text-slate-700",
  ASIGNADA: "bg-amber-100 text-amber-800",
  EN_CAMINO: "bg-blue-100 text-blue-800",
  RESUELTA: "bg-emerald-100 text-emerald-800",
};

export default function TecnicoFichaModal({ tecnicoId, onClose }: { tecnicoId: string; onClose: () => void }) {
  const [detalle, setDetalle] = useState<Detalle | null>(null);
  const [loading, setLoading] = useState(true);
  const [vista, setVista] = useState<"pendientes" | "historial">("pendientes");
  const [tipoFiltro, setTipoFiltro] = useState<string | null>(null);
  const [incidenciaDetalle, setIncidenciaDetalle] = useState<IncidenciaDetalleData | null>(null);

  const load = useCallback(() => {
    fetch(`/api/tecnicos/${tecnicoId}`)
      .then((r) => r.json())
      .then((d) => {
        setDetalle(d);
        setLoading(false);
      });
  }, [tecnicoId]);

  useEffect(() => {
    load();
  }, [load]);

  const totales = useMemo(() => {
    if (!detalle) return [];
    const map = new Map<string, number>();
    for (const m of detalle.materiales) map.set(m.tipo, (map.get(m.tipo) || 0) + 1);
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [detalle]);

  const materialesVisibles = useMemo(() => {
    if (!detalle) return [];
    return tipoFiltro ? detalle.materiales.filter((m) => m.tipo === tipoFiltro) : detalle.materiales;
  }, [detalle, tipoFiltro]);

  const incidencias = vista === "pendientes" ? detalle?.incidenciasPendientes : detalle?.historialIncidencias;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-5">
        <div className="flex items-start justify-between mb-4">
          <div>
            {loading ? (
              <div className="text-slate-400 text-sm">Cargando ficha…</div>
            ) : (
              <>
                <h2 className="font-bold text-lg text-slate-800">{detalle?.tecnico.name}</h2>
                <div className="text-xs text-slate-500">
                  @{detalle?.tecnico.username} {detalle?.tecnico.zona ? `· ${detalle.tecnico.zona}` : ""}
                </div>
                {detalle?.tecnico.email && <div className="text-xs text-slate-500">✉️ {detalle.tecnico.email}</div>}
                {detalle?.tecnico.phone && <div className="text-xs text-slate-400">📞 {detalle.tecnico.phone}</div>}
                {detalle?.tecnico.personaContacto && (
                  <div className="text-xs text-slate-400">Contacto: {detalle.tecnico.personaContacto}</div>
                )}
                {detalle?.tecnico.direccion && <div className="text-xs text-slate-400">{detalle.tecnico.direccion}</div>}
                {detalle?.tecnico.horario && <div className="text-[11px] text-slate-400">🕒 {detalle.tecnico.horario}</div>}
                {detalle?.tecnico.radioCobertura && (
                  <div className="text-[11px] text-slate-400">Cobertura sin coste: {detalle.tecnico.radioCobertura}</div>
                )}
                {detalle?.tecnico.costeKm && (
                  <div className="text-[11px] text-slate-400">Coste km: {detalle.tecnico.costeKm}</div>
                )}
                {detalle?.tecnico.condiciones && (
                  <div className="text-[11px] text-amber-700 mt-1 italic">{detalle.tecnico.condiciones}</div>
                )}
              </>
            )}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">
            ×
          </button>
        </div>

        {!loading && detalle && (
          <>
            {/* 1. Material disponible */}
            <div className="mb-5">
              <h3 className="text-sm font-semibold text-slate-700 mb-2">Material disponible</h3>
              {totales.length === 0 ? (
                <p className="text-xs text-slate-400">No tiene material asignado actualmente.</p>
              ) : (
                <div className="flex flex-wrap gap-2 mb-2">
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
                    Total: {detalle.materiales.length}
                  </span>
                </div>
              )}
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {materialesVisibles.map((m) => (
                  <div key={m.id} className="text-xs text-slate-500 bg-slate-50 rounded-lg px-2 py-1.5 flex justify-between gap-2">
                    <span className="font-mono shrink-0">{m.numeroSerie}</span>
                    <span className="truncate text-right">
                      {TIPO_MATERIAL_LABELS[m.tipo as keyof typeof TIPO_MATERIAL_LABELS] || m.tipo} · {m.nombre}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* 2. Recibo de material (envíos pendientes de recibir) */}
            <div className="mb-5">
              <h3 className="text-sm font-semibold text-slate-700 mb-2">
                Recibo de material ({detalle.enviosPendientes.length})
              </h3>
              {detalle.enviosPendientes.length === 0 ? (
                <p className="text-xs text-slate-400">No tiene envíos pendientes de recibir.</p>
              ) : (
                <div className="space-y-2">
                  {detalle.enviosPendientes.map((e) => {
                    const confirmados = e.items.filter((i) => i.escaneadoDestino).length;
                    return (
                      <div key={e.id} className="bg-slate-50 rounded-lg p-2.5">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <span className="text-xs font-medium text-slate-700">
                            {e.tipo === "ENVIO" ? "Envío" : "Recogida"} · {e.transportista}
                          </span>
                          <span className="text-[10px] bg-amber-100 text-amber-800 rounded-full px-2 py-0.5">
                            {ESTADO_ENVIO_LABELS[e.estado as keyof typeof ESTADO_ENVIO_LABELS] || e.estado}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          {new Date(e.fechaCreacion).toLocaleDateString("es-ES")} · Confirmado {confirmados}/{e.items.length}
                        </div>
                        <div className="mt-1 space-y-0.5">
                          {e.items.map((i) => (
                            <div key={i.id} className="text-[11px] text-slate-500 flex justify-between gap-2">
                              <span className="font-mono shrink-0">{i.material.numeroSerie}</span>
                              <span className="truncate">{i.material.nombre}</span>
                              <span className="shrink-0">{i.escaneadoDestino ? "✓" : "…"}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 3. Órdenes de envío recurrente */}
            <div className="mb-5">
              <h3 className="text-sm font-semibold text-slate-700 mb-2">
                🔁 Envíos recurrentes ({detalle.ordenesRecurrentes.length})
              </h3>
              <OrdenesRecurrentes ordenes={detalle.ordenesRecurrentes} onCambio={load} />
            </div>

            {/* 4. Incidencias */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-slate-700">Incidencias</h3>
                <div className="flex gap-1">
                  <button
                    onClick={() => setVista("pendientes")}
                    className={`text-xs rounded-full px-3 py-1 ${vista === "pendientes" ? "bg-admira-600 text-white" : "bg-slate-100 text-slate-600"}`}
                  >
                    Pendientes ({detalle.incidenciasPendientes.length})
                  </button>
                  <button
                    onClick={() => setVista("historial")}
                    className={`text-xs rounded-full px-3 py-1 ${vista === "historial" ? "bg-admira-600 text-white" : "bg-slate-100 text-slate-600"}`}
                  >
                    Historial ({detalle.historialIncidencias.length})
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                {(!incidencias || incidencias.length === 0) && (
                  <p className="text-xs text-slate-400 py-3 text-center">
                    {vista === "pendientes" ? "No tiene incidencias pendientes." : "Sin incidencias resueltas todavía."}
                  </p>
                )}
                {incidencias?.map((inc) => (
                  <button
                    key={inc.id}
                    onClick={() => setIncidenciaDetalle(inc)}
                    className="w-full text-left bg-slate-50 hover:bg-slate-100 rounded-xl p-3 transition-colors"
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-slate-800">{inc.titulo}</span>
                      <span className={`text-[10px] rounded-full px-2 py-0.5 ${ESTADO_COLORS[inc.estado]}`}>
                        {ESTADO_INCIDENCIA_LABELS[inc.estado as keyof typeof ESTADO_INCIDENCIA_LABELS]}
                      </span>
                      <span className="text-[10px] bg-slate-200 text-slate-600 rounded-full px-2 py-0.5">
                        {TIPO_INCIDENCIA_LABELS[inc.tipo as keyof typeof TIPO_INCIDENCIA_LABELS]}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                      {inc.ticketExternoId && <>Ticket {inc.ticketExternoId} · </>}
                      {inc.cliente} {inc.direccion ? `· ${inc.direccion}` : ""}
                    </div>
                    {inc.materialesUsados.length > 0 && (
                      <div className="text-xs text-slate-400 mt-1">
                        Material: {inc.materialesUsados.map((m) => m.material.numeroSerie).join(", ")}
                      </div>
                    )}
                    <div className="text-[10px] text-admira-600 mt-1">Ver todos los detalles →</div>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {incidenciaDetalle && (
        <IncidenciaDetalle incidencia={incidenciaDetalle} role="ADMIRA" onClose={() => setIncidenciaDetalle(null)} />
      )}
    </div>
  );
}
