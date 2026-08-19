"use client";

import { useEffect, useState, useCallback } from "react";
import BarcodeScanner from "@/components/BarcodeScanner";
import {
  ESTADO_ENVIO_LABELS,
  TIPO_MATERIAL_LABELS,
  EstadoEnvio,
} from "@/lib/constants";

type Material = {
  id: string;
  numeroSerie: string;
  tipo: string;
  nombre: string;
};

type EnvioItem = {
  id: string;
  material: Material;
  escaneadoOrigen: boolean;
  escaneadoDestino: boolean;
};

type Envio = {
  id: string;
  tipo: "ENVIO" | "RECOGIDA";
  transportista: string;
  origen: string;
  destino: string;
  estado: EstadoEnvio;
  esRecurrente: boolean;
  notas: string | null;
  fechaCreacion: string;
  tecnico: { id: string; name: string; zona: string | null };
  creadoPor?: { name: string };
  items: EnvioItem[];
};

const ESTADO_COLORS: Record<string, string> = {
  PENDIENTE_PREPARACION: "bg-amber-100 text-amber-800",
  EN_TRANSITO: "bg-blue-100 text-blue-800",
  ENVIADO: "bg-blue-100 text-blue-800",
  RECIBIDO: "bg-emerald-100 text-emerald-800",
  INCIDENCIA: "bg-red-100 text-red-800",
};

export default function EnviosBoard({ role }: { role: "FDM" | "TECNICO" | "ADMIRA" }) {
  const [envios, setEnvios] = useState<Envio[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanTarget, setScanTarget] = useState<Envio | null>(null);
  const [feedback, setFeedback] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const [vista, setVista] = useState<"PENDIENTES" | "COMPLETADOS">("PENDIENTES");
  const [busqueda, setBusqueda] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/envios");
    const data = await res.json();
    setEnvios(data.envios || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function sideForRole(envio: Envio): "origen" | "destino" | null {
    const origenRol = envio.tipo === "ENVIO" ? "FDM" : "TECNICO";
    const destinoRol = envio.tipo === "ENVIO" ? "TECNICO" : "FDM";
    if (role === origenRol && !envio.items.every((i) => i.escaneadoOrigen)) return "origen";
    if (role === destinoRol && envio.items.every((i) => i.escaneadoOrigen) && !envio.items.every((i) => i.escaneadoDestino))
      return "destino";
    return null;
  }

  async function handleScan(code: string) {
    if (!scanTarget) return;
    const res = await fetch(`/api/envios/${scanTarget.id}/scan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ numeroSerie: code }),
    });
    const data = await res.json();
    if (!res.ok) {
      setFeedback({ type: "error", text: data.error || "Error al escanear." });
      return;
    }
    setFeedback({ type: "ok", text: `Material ${data.material?.nombre || code} confirmado.` });
    await load();
    const updated = data.envio as Envio;
    setScanTarget(updated.items.every((i) => i.escaneadoOrigen && i.escaneadoDestino) ? null : updated);
  }

  const completado = (e: Envio) => e.estado === "RECIBIDO";
  const pendientes = envios.filter((e) => !completado(e));
  const completados = envios.filter(completado);

  const listaBase = vista === "PENDIENTES" ? pendientes : completados;

  // Buscador sobre técnico, origen/destino y el material que contiene el envío.
  const q = busqueda.trim().toLowerCase();
  const visibleEnvios = q
    ? listaBase.filter(
        (e) =>
          e.tecnico?.name.toLowerCase().includes(q) ||
          e.origen.toLowerCase().includes(q) ||
          e.destino.toLowerCase().includes(q) ||
          e.items.some(
            (i) => i.material.nombre.toLowerCase().includes(q) || i.material.numeroSerie.toLowerCase().includes(q)
          )
      )
    : listaBase;

  if (loading) return <p className="text-sm text-slate-400 py-4">Cargando envíos…</p>;

  return (
    <div className="space-y-3">
      {feedback && (
        <div
          className={`text-sm rounded-lg px-3 py-2 ${
            feedback.type === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
          }`}
        >
          {feedback.text}
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={() => setVista("PENDIENTES")}
          className={`text-xs font-medium rounded-lg px-3 py-2 transition-colors ${
            vista === "PENDIENTES" ? "bg-admira-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          Pendientes ({pendientes.length})
        </button>
        <button
          onClick={() => setVista("COMPLETADOS")}
          className={`text-xs font-medium rounded-lg px-3 py-2 transition-colors ${
            vista === "COMPLETADOS" ? "bg-admira-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          Completados ({completados.length})
        </button>
      </div>

      <input
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        placeholder="Buscar por técnico, origen/destino o material (nombre o número de serie)…"
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
      />

      {visibleEnvios.length === 0 && (
        <p className="text-sm text-slate-400 py-6 text-center">
          {listaBase.length === 0
            ? `No hay envíos ${vista === "PENDIENTES" ? "pendientes" : "completados"}.`
            : "Ningún envío coincide con la búsqueda."}
        </p>
      )}
      {visibleEnvios.map((envio) => {
        const side = role !== "ADMIRA" ? sideForRole(envio) : null;
        const progresoOrigen = envio.items.filter((i) => i.escaneadoOrigen).length;
        const progresoDestino = envio.items.filter((i) => i.escaneadoDestino).length;
        return (
          <div key={envio.id} className="bg-white rounded-xl shadow-sm border border-slate-100 p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-slate-800">
                    {envio.tipo === "ENVIO" ? "Envío" : "Recogida"} · {envio.transportista}
                  </span>
                  {envio.esRecurrente && (
                    <span className="text-[10px] bg-purple-100 text-purple-700 rounded-full px-2 py-0.5">
                      Recurrente
                    </span>
                  )}
                  <span className={`text-[11px] rounded-full px-2 py-0.5 ${ESTADO_COLORS[envio.estado] || "bg-slate-100"}`}>
                    {ESTADO_ENVIO_LABELS[envio.estado] || envio.estado}
                  </span>
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  {envio.origen} → {envio.destino} · Técnico: {envio.tecnico?.name}
                  {envio.tecnico?.zona ? ` (${envio.tecnico.zona})` : ""}
                </div>
                {envio.notas && <div className="text-xs text-slate-400 mt-1 italic">{envio.notas}</div>}
              </div>
              {side && (
                <button
                  onClick={() => setScanTarget(envio)}
                  className="shrink-0 bg-admira-600 text-white text-xs font-medium rounded-lg px-3 py-2 whitespace-nowrap"
                >
                  📷 Escanear
                </button>
              )}
            </div>
            <div className="mt-3 space-y-1">
              {envio.items.map((item) => (
                <div key={item.id} className="flex items-center justify-between text-xs bg-slate-50 rounded-lg px-2 py-1.5">
                  <div>
                    <span className="font-mono text-slate-600">{item.material.numeroSerie}</span>{" "}
                    <span className="text-slate-500">
                      · {TIPO_MATERIAL_LABELS[item.material.tipo as keyof typeof TIPO_MATERIAL_LABELS] || item.material.tipo} ·{" "}
                      {item.material.nombre}
                    </span>
                  </div>
                  <div className="flex gap-1">
                    <span className={`rounded-full px-2 py-0.5 ${item.escaneadoOrigen ? "bg-blue-100 text-blue-700" : "bg-slate-200 text-slate-500"}`}>
                      Origen {item.escaneadoOrigen ? "✓" : "…"}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 ${item.escaneadoDestino ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-500"}`}>
                      Destino {item.escaneadoDestino ? "✓" : "…"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <div className="text-[11px] text-slate-400 mt-2">
              Origen: {progresoOrigen}/{envio.items.length} · Destino: {progresoDestino}/{envio.items.length}
            </div>
          </div>
        );
      })}
      {scanTarget && (
        <BarcodeScanner
          onScan={handleScan}
          onClose={() => setScanTarget(null)}
        />
      )}
    </div>
  );
}
