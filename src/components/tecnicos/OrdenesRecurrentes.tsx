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

type LineaOtro = { descripcion: string; cantidad: number };

// Categorías con cupo fijo (una fila cada una). "Otro" se gestiona aparte,
// como una lista de líneas propias, porque puede haber varias distintas en
// el mismo pedido (ej. "2 tablet" + "3 regleta").
const CATEGORIAS_FIJAS = TIPOS_MATERIAL.filter((t) => t !== "OTRO");

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
  const [otros, setOtros] = useState<LineaOtro[]>([]);
  const [notas, setNotas] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [feedback, setFeedback] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);

  function empezarEdicion(o: OrdenRecurrente) {
    setEditando(o.id);
    setFrecuencia(o.frecuenciaDias);
    setTransportista(o.transportista);
    const items = parsePedido(o.materialConfig);
    setConfig(items.filter((i) => i.tipo !== "OTRO"));
    setOtros(
      items.filter((i) => i.tipo === "OTRO").map((i) => ({ descripcion: i.descripcion || "", cantidad: i.cantidad }))
    );
    setNotas(o.notas || "");
    setFeedback(null);
  }

  async function guardar(id: string) {
    const sinDescribir = otros.filter((o) => o.cantidad > 0 && !o.descripcion.trim());
    if (sinDescribir.length > 0) {
      setFeedback({ tipo: "error", texto: 'Indica a mano qué material es exactamente en cada línea de "Otro" (o quítala).' });
      return;
    }
    setGuardando(true);
    setFeedback(null);
    const materialConfig = [
      ...config,
      ...otros
        .filter((o) => o.cantidad > 0 && o.descripcion.trim())
        .map((o) => ({ tipo: "OTRO", cantidad: o.cantidad, descripcion: o.descripcion.trim() })),
    ];
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

  function añadirLineaOtro() {
    setOtros((prev) => [...prev, { descripcion: "", cantidad: 1 }]);
  }
  function actualizarLineaOtro(idx: number, cambios: Partial<LineaOtro>) {
    setOtros((prev) => prev.map((o, i) => (i === idx ? { ...o, ...cambios } : o)));
  }
  function quitarLineaOtro(idx: number) {
    setOtros((prev) => prev.filter((_, i) => i !== idx));
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
                    {CATEGORIAS_FIJAS.map((tipo) => {
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
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">Otro material (opcional, se pueden añadir varias líneas)</label>
                  <div className="space-y-1">
                    {otros.map((linea, idx) => (
                      <div key={idx} className="flex gap-1">
                        <input
                          value={linea.descripcion}
                          onChange={(e) => actualizarLineaOtro(idx, { descripcion: e.target.value })}
                          placeholder='¿Qué es? (ej. "tablet")'
                          className="flex-1 rounded-lg border border-admira-300 bg-admira-50 px-2 py-1.5 text-xs"
                        />
                        <input
                          type="number"
                          min={1}
                          value={linea.cantidad}
                          onChange={(e) => actualizarLineaOtro(idx, { cantidad: Math.max(1, Number(e.target.value) || 1) })}
                          className="w-12 rounded-lg border border-admira-300 bg-admira-50 px-1.5 py-1.5 text-xs text-right"
                        />
                        <button type="button" onClick={() => quitarLineaOtro(idx)} className="text-slate-400 hover:text-red-600 px-1" title="Quitar">
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                  <button type="button" onClick={añadirLineaOtro} className="mt-1 text-[11px] font-medium text-admira-600 hover:underline">
                    + Añadir otro material
                  </button>
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
