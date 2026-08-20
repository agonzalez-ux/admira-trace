"use client";

import { useState } from "react";
import { FRECUENCIAS_RECURRENTES, TIPO_MATERIAL_LABELS, TIPOS_MATERIAL, TRANSPORTISTAS } from "@/lib/constants";
import { parsePedido, etiquetaPedido, type PedidoItem } from "@/lib/envioLabel";

export type OrdenRecurrente = {
  id: string;
  frecuenciaDias: number;
  transportista: string;
  materialConfig: string;
  activa: boolean;
  notas: string | null;
  ultimaEjecucion: string | null;
  proximaEjecucion: string;
  envios: { id: string }[];
};

export default function OrdenesRecurrentes({
  ordenes,
  onCambio,
}: {
  ordenes: OrdenRecurrente[];
  onCambio: () => void;
}) {
  const [editando, setEditando] = useState<string | null>(null);
  const [frecuencia, setFrecuencia] = useState(30);
  const [transportista, setTransportista] = useState<string>("MARESA");
  const [config, setConfig] = useState<PedidoItem[]>([]);
  // Solo se usa (y hace falta) cuando la categoría "Otro" tiene cantidad > 0.
  const [otroDescripcion, setOtroDescripcion] = useState("");
  const [notas, setNotas] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [feedback, setFeedback] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);

  function empezarEdicion(o: OrdenRecurrente) {
    setEditando(o.id);
    setFrecuencia(o.frecuenciaDias);
    setTransportista(o.transportista);
    const items = parsePedido(o.materialConfig);
    setConfig(items);
    setOtroDescripcion(items.find((i) => i.tipo === "OTRO")?.descripcion || "");
    setNotas(o.notas || "");
    setFeedback(null);
  }

  async function guardar(id: string) {
    setGuardando(true);
    setFeedback(null);
    const materialConfig = config.map((i) =>
      i.tipo === "OTRO" ? { ...i, descripcion: otroDescripcion.trim() } : i
    );
    const res = await fetch(`/api/ordenes-recurrentes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ frecuenciaDias: frecuencia, transportista, materialConfig, notas }),
    });
    const data = await res.json();
    setGuardando(false);
    if (!res.ok) {
      setFeedback({ tipo: "error", texto: data.error || "Error al guardar." });
      return;
    }
    setEditando(null);
    onCambio();
  }

  async function alternarActiva(o: OrdenRecurrente) {
    const res = await fetch(`/api/ordenes-recurrentes/${o.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activa: !o.activa }),
    });
    if (!res.ok) {
      const data = await res.json();
      setFeedback({ tipo: "error", texto: data.error || "Error al cambiar el estado." });
      return;
    }
    onCambio();
  }

  async function eliminar(o: OrdenRecurrente) {
    const res = await fetch(`/api/ordenes-recurrentes/${o.id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) {
      setFeedback({ tipo: "error", texto: data.error || "Error al eliminar." });
      return;
    }
    if (data.desactivada) setFeedback({ tipo: "ok", texto: data.mensaje });
    onCambio();
  }

  function cambiarCantidad(tipo: string, cantidad: number) {
    setConfig((prev) => {
      const sin = prev.filter((i) => i.tipo !== tipo);
      return cantidad > 0 ? [...sin, { tipo, cantidad }] : sin;
    });
  }

  if (ordenes.length === 0) {
    return (
      <p className="text-xs text-slate-400">
        Este técnico no tiene ninguna orden de envío recurrente. Se crean al marcar &quot;envío recurrente&quot; al
        generar un envío.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {feedback && (
        <p className={`text-xs ${feedback.tipo === "ok" ? "text-emerald-600" : "text-red-600"}`}>{feedback.texto}</p>
      )}
      {ordenes.map((o) => {
        const items = parsePedido(o.materialConfig);
        const enEdicion = editando === o.id;
        return (
          <div key={o.id} className={`rounded-xl p-3 border ${o.activa ? "bg-purple-50 border-purple-200" : "bg-slate-50 border-slate-200"}`}>
            {!enEdicion ? (
              <>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-800">
                      Cada {o.frecuenciaDias} días · {o.transportista}
                      {!o.activa && <span className="text-[10px] bg-slate-300 text-slate-700 rounded-full px-2 py-0.5 ml-2">Pausada</span>}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">{etiquetaPedido(items)}</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      Próximo envío: {new Date(o.proximaEjecucion).toLocaleDateString("es-ES")}
                      {o.ultimaEjecucion && ` · Último: ${new Date(o.ultimaEjecucion).toLocaleDateString("es-ES")}`}
                      {o.envios.length > 0 && ` · ${o.envios.length} envío(s) generado(s)`}
                    </div>
                    {o.notas && <div className="text-[11px] text-slate-400 italic mt-0.5">{o.notas}</div>}
                  </div>
                </div>
                <div className="flex gap-2 mt-2">
                  <button onClick={() => empezarEdicion(o)} className="text-[11px] bg-admira-600 text-white rounded-lg px-2 py-1">
                    Editar
                  </button>
                  <button onClick={() => alternarActiva(o)} className="text-[11px] bg-slate-600 text-white rounded-lg px-2 py-1">
                    {o.activa ? "Pausar" : "Reactivar"}
                  </button>
                  <button onClick={() => eliminar(o)} className="text-[11px] bg-red-600 text-white rounded-lg px-2 py-1">
                    Eliminar
                  </button>
                </div>
              </>
            ) : (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">Frecuencia</label>
                    <select value={frecuencia} onChange={(e) => setFrecuencia(Number(e.target.value))} className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs">
                      {FRECUENCIAS_RECURRENTES.map((f) => (
                        <option key={f.dias} value={f.dias}>{f.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">Transportista</label>
                    <select value={transportista} onChange={(e) => setTransportista(e.target.value)} className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs">
                      {TRANSPORTISTAS.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">Material a reponer cada vez</label>
                  <div className="grid grid-cols-2 gap-1">
                    {TIPOS_MATERIAL.map((tipo) => {
                      const actual = config.find((i) => i.tipo === tipo)?.cantidad || 0;
                      return (
                        <div key={tipo} className="flex items-center gap-1">
                          <input
                            type="number"
                            min={0}
                            value={actual}
                            onChange={(e) => cambiarCantidad(tipo, Number(e.target.value))}
                            className="w-14 rounded border border-slate-300 px-1.5 py-1 text-xs"
                          />
                          <span className="text-[11px] text-slate-600 truncate">{TIPO_MATERIAL_LABELS[tipo]}</span>
                        </div>
                      );
                    })}
                  </div>
                  {(config.find((i) => i.tipo === "OTRO")?.cantidad || 0) > 0 && (
                    <input
                      value={otroDescripcion}
                      onChange={(e) => setOtroDescripcion(e.target.value)}
                      placeholder='¿Qué es exactamente? (ej. "tablet", "regleta"...)'
                      className="w-full mt-1 rounded-lg border border-admira-300 bg-admira-50 px-2 py-1.5 text-xs"
                    />
                  )}
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">Notas</label>
                  <input value={notas} onChange={(e) => setNotas(e.target.value)} className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs" />
                </div>
                <div className="flex gap-2">
                  <button onClick={() => guardar(o.id)} disabled={guardando} className="text-[11px] bg-emerald-600 text-white rounded-lg px-2 py-1 disabled:opacity-60">
                    {guardando ? "Guardando…" : "Guardar"}
                  </button>
                  <button onClick={() => setEditando(null)} className="text-[11px] bg-slate-400 text-white rounded-lg px-2 py-1">
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
