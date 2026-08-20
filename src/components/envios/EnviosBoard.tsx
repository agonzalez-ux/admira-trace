"use client";

import { useEffect, useState, useCallback } from "react";
import BarcodeScanner from "@/components/BarcodeScanner";
import {
  ESTADO_ENVIO_LABELS,
  EstadoEnvio,
} from "@/lib/constants";
import { parsePedido, etiquetaPedido, etiquetaTipoMovimiento, origenRolFor, destinoRolFor } from "@/lib/envioLabel";
import { etiquetaTipo } from "@/lib/materialLabel";

type Material = {
  id: string;
  numeroSerie: string;
  tipo: string;
  tipoPersonalizado: string | null;
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
  tipo: "ENVIO" | "RECOGIDA" | "TRANSFERENCIA";
  transportista: string;
  origen: string;
  destino: string;
  almacen: "FDM" | "ADMIRA";
  pedido: string;
  estado: EstadoEnvio;
  esRecurrente: boolean;
  notas: string | null;
  fechaCreacion: string;
  tecnico: { id: string; name: string; zona: string | null } | null;
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
  const [finalizando, setFinalizando] = useState<string | null>(null);

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

  // Quién tiene que escanear ahora mismo, y en qué lado — mismo criterio que
  // usa el backend para autorizar (ver src/lib/envioLabel.ts), más el propio
  // estado del envío: en origen solo mientras está pendiente de preparación,
  // en destino solo una vez que ya salió.
  function sideForRole(envio: Envio): "origen" | "destino" | null {
    const origenRol = origenRolFor(envio);
    const destinoRol = destinoRolFor(envio);
    if (role === origenRol && envio.estado === "PENDIENTE_PREPARACION") return "origen";
    if (role === destinoRol && envio.estado === "EN_TRANSITO") return "destino";
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
    setScanTarget(sideForRole(updated) ? updated : null);
  }

  async function finalizarConLoEscaneado(envio: Envio) {
    setFinalizando(envio.id);
    setFeedback(null);
    const res = await fetch(`/api/envios/${envio.id}/finalizar`, { method: "POST" });
    const data = await res.json();
    setFinalizando(null);
    if (!res.ok) {
      setFeedback({ type: "error", text: data.error || "Error al cerrar el movimiento." });
      return;
    }
    setFeedback({
      type: "error",
      text: "Movimiento cerrado con lo escaneado — se ha avisado a Admira de la diferencia para que lo revise.",
    });
    setScanTarget(null);
    await load();
  }

  const completado = (e: Envio) => e.estado === "RECIBIDO" || e.estado === "INCIDENCIA";
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
            ? `No hay movimientos ${vista === "PENDIENTES" ? "pendientes" : "completados"}.`
            : "Ningún movimiento coincide con la búsqueda."}
        </p>
      )}
      {visibleEnvios.map((envio) => {
        const side = sideForRole(envio);
        const pedido = parsePedido(envio.pedido);
        const totalPedido = pedido.reduce((s, p) => s + p.cantidad, 0);
        const escaneadosOrigen = envio.items.length;
        const confirmadosDestino = envio.items.filter((i) => i.escaneadoDestino).length;
        const puedeFinalizar =
          side === "origen" ? escaneadosOrigen > 0 : side === "destino" ? confirmadosDestino > 0 : false;

        return (
          <div key={envio.id} className="bg-white rounded-xl shadow-sm border border-slate-100 p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-slate-800">
                    {etiquetaTipoMovimiento(envio)} · {envio.transportista}
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
                  {envio.origen} → {envio.destino}
                  {envio.tecnico && ` · Técnico: ${envio.tecnico.name}${envio.tecnico.zona ? ` (${envio.tecnico.zona})` : ""}`}
                </div>
                <div className="text-xs text-slate-600 mt-1">Pedido: {etiquetaPedido(pedido)}</div>
                {envio.notas && <div className="text-xs text-slate-400 mt-1 italic">{envio.notas}</div>}
              </div>
              <div className="flex flex-col gap-1.5 shrink-0 items-end">
                {side && (
                  <button
                    onClick={() => setScanTarget(envio)}
                    className="bg-admira-600 text-white text-xs font-medium rounded-lg px-3 py-2 whitespace-nowrap"
                  >
                    📷 Escanear
                  </button>
                )}
                {side && puedeFinalizar && (
                  <button
                    onClick={() => finalizarConLoEscaneado(envio)}
                    disabled={finalizando === envio.id}
                    className="text-[11px] text-amber-700 hover:underline disabled:opacity-60 whitespace-nowrap"
                    title="Da por cerrado este lado aunque falte algo por escanear — avisa a Admira de la diferencia"
                  >
                    {finalizando === envio.id ? "Cerrando…" : "Cerrar con lo escaneado"}
                  </button>
                )}
              </div>
            </div>

            {envio.items.length > 0 && (
              <div className="mt-3 space-y-1">
                {envio.items.map((item) => (
                  <div key={item.id} className="flex items-center justify-between text-xs bg-slate-50 rounded-lg px-2 py-1.5">
                    <div className="min-w-0 truncate">
                      <span className="font-mono text-slate-600">{item.material.numeroSerie}</span>{" "}
                      <span className="text-slate-500">
                        · {etiquetaTipo(item.material)} ·{" "}
                        {item.material.nombre}
                      </span>
                    </div>
                    <div className="flex gap-1 shrink-0">
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
            )}

            <div className="text-[11px] text-slate-400 mt-2">
              {envio.estado === "PENDIENTE_PREPARACION"
                ? `Escaneado en origen: ${escaneadosOrigen}/${totalPedido}`
                : `Enviado: ${escaneadosOrigen} · Confirmado en destino: ${confirmadosDestino}/${escaneadosOrigen}`}
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
