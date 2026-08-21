"use client";

import { useEffect, useState, useCallback } from "react";
import BarcodeScanner from "@/components/BarcodeScanner";
import {
  ESTADO_ENVIO_LABELS,
  EstadoEnvio,
  FRANJAS_RECOGIDA,
  TIPOS_BULTO,
  TIPO_BULTO_LABELS,
} from "@/lib/constants";
import { parsePedido, etiquetaPedido, etiquetaTipoMovimiento, origenRolFor, destinoRolFor } from "@/lib/envioLabel";
import { direccionAlmacen } from "@/lib/transportistas";
import { etiquetaTipo } from "@/lib/materialLabel";

const GLS_PORTAL_URL = process.env.NEXT_PUBLIC_GLS_PORTAL_URL || "";

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
  emailTransportistaEstado: string | null;
  emailTransportistaError: string | null;
};

const ESTADO_COLORS: Record<string, string> = {
  PENDIENTE_PREPARACION: "bg-amber-100 text-amber-800",
  EN_TRANSITO: "bg-blue-100 text-blue-800",
  ENVIADO: "bg-blue-100 text-blue-800",
  RECIBIDO: "bg-emerald-100 text-emerald-800",
  INCIDENCIA: "bg-red-100 text-red-800",
};

type DatosTransporte = {
  fechaRecogida: string;
  franjaRecogida: string;
  tipoBulto: string;
  bultoLargoCm: string;
  bultoAnchoCm: string;
  bultoAltoCm: string;
  bultoPesoKg: string;
  detalleTransporte: string;
  ciudadRecogida: string;
  direccionRecogida: string;
  ciudadEntrega: string;
  direccionEntrega: string;
};

const DATOS_TRANSPORTE_VACIOS: DatosTransporte = {
  fechaRecogida: "",
  franjaRecogida: FRANJAS_RECOGIDA[0].id,
  tipoBulto: TIPOS_BULTO[0],
  bultoLargoCm: "",
  bultoAnchoCm: "",
  bultoAltoCm: "",
  bultoPesoKg: "",
  detalleTransporte: "",
  ciudadRecogida: "",
  direccionRecogida: "",
  ciudadEntrega: "",
  direccionEntrega: "",
};

export default function EnviosBoard({ role }: { role: "FDM" | "TECNICO" | "ADMIRA" }) {
  const [envios, setEnvios] = useState<Envio[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanTarget, setScanTarget] = useState<Envio | null>(null);
  const [feedback, setFeedback] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const [vista, setVista] = useState<"PENDIENTES" | "COMPLETADOS">("PENDIENTES");
  const [busqueda, setBusqueda] = useState("");
  const [finalizando, setFinalizando] = useState<string | null>(null);
  const [rellenandoId, setRellenandoId] = useState<string | null>(null);
  const [datosTransporte, setDatosTransporte] = useState<DatosTransporte>(DATOS_TRANSPORTE_VACIOS);
  const [guardandoDatos, setGuardandoDatos] = useState(false);
  const [reintentandoId, setReintentandoId] = useState<string | null>(null);

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

  async function guardarDatosTransporte(envioId: string) {
    setGuardandoDatos(true);
    setFeedback(null);
    const res = await fetch(`/api/envios/${envioId}/datos-transporte`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(datosTransporte),
    });
    const data = await res.json();
    setGuardandoDatos(false);
    if (!res.ok) {
      setFeedback({ type: "error", text: data.error || "Error al guardar los datos de transporte." });
      return;
    }
    setFeedback({ type: "ok", text: "Datos guardados — se ha avisado al transportista." });
    setRellenandoId(null);
    setDatosTransporte(DATOS_TRANSPORTE_VACIOS);
    await load();
  }

  async function reintentarAvisoTransportista(envioId: string) {
    setReintentandoId(envioId);
    setFeedback(null);
    const res = await fetch(`/api/envios/${envioId}/datos-transporte`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const data = await res.json();
    setReintentandoId(null);
    if (!res.ok) {
      setFeedback({ type: "error", text: data.error || "Error al reintentar el aviso." });
      return;
    }
    setFeedback({ type: "ok", text: "Reintento hecho." });
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
        const puedeRellenarTransporte =
          envio.emailTransportistaEstado === "PENDIENTE_DATOS" && role === origenRolFor(envio);
        const rellenandoEste = rellenandoId === envio.id;

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
                  {envio.emailTransportistaEstado === "PENDIENTE_DATOS" && (
                    <span className="text-[11px] rounded-full px-2 py-0.5 bg-amber-100 text-amber-800">
                      Transportista: faltan datos
                    </span>
                  )}
                  {envio.emailTransportistaEstado === "ENVIADO" && (
                    <span className="text-[11px] rounded-full px-2 py-0.5 bg-emerald-100 text-emerald-800">
                      Transportista avisado ✓
                    </span>
                  )}
                  {envio.emailTransportistaEstado === "ERROR" && (
                    <span className="text-[11px] rounded-full px-2 py-0.5 bg-red-100 text-red-800" title={envio.emailTransportistaError || undefined}>
                      Error al avisar al transportista
                    </span>
                  )}
                  {envio.transportista === "GLS" && GLS_PORTAL_URL && (
                    <a
                      href={GLS_PORTAL_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] rounded-full px-2 py-0.5 bg-slate-100 text-slate-700 hover:bg-slate-200 underline"
                    >
                      🔗 Portal GLS
                    </a>
                  )}
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
                {puedeRellenarTransporte && !rellenandoEste && (
                  <button
                    onClick={() => {
                      setRellenandoId(envio.id);
                      // Si el origen o el destino es un almacén propio (no un
                      // técnico), ya sabemos su dirección — se precarga y se
                      // puede corregir a mano si hiciera falta.
                      const origenRol = origenRolFor(envio);
                      const destinoRol = destinoRolFor(envio);
                      const recogida =
                        origenRol === "FDM" || origenRol === "ADMIRA" ? direccionAlmacen(origenRol) : null;
                      const entrega =
                        destinoRol === "FDM" || destinoRol === "ADMIRA" ? direccionAlmacen(destinoRol) : null;
                      setDatosTransporte({
                        ...DATOS_TRANSPORTE_VACIOS,
                        direccionRecogida: recogida?.direccion || "",
                        ciudadRecogida: recogida?.ciudad || "",
                        direccionEntrega: entrega?.direccion || "",
                        ciudadEntrega: entrega?.ciudad || "",
                      });
                    }}
                    className="bg-sky-600 text-white text-xs font-medium rounded-lg px-3 py-2 whitespace-nowrap"
                  >
                    Rellenar datos de transporte
                  </button>
                )}
                {envio.emailTransportistaEstado === "ERROR" && role === origenRolFor(envio) && (
                  <button
                    onClick={() => reintentarAvisoTransportista(envio.id)}
                    disabled={reintentandoId === envio.id}
                    className="text-[11px] text-red-700 hover:underline disabled:opacity-60 whitespace-nowrap"
                  >
                    {reintentandoId === envio.id ? "Reintentando…" : "Reintentar aviso"}
                  </button>
                )}
              </div>
            </div>

            {rellenandoEste && (
              <div className="mt-3 bg-sky-50 border border-sky-200 rounded-lg p-3 space-y-2">
                <p className="text-xs font-medium text-sky-900">
                  Datos para avisar a {envio.transportista} por email
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] text-sky-800 mb-1">Día de recogida</label>
                    <input
                      type="date"
                      value={datosTransporte.fechaRecogida}
                      onChange={(e) => setDatosTransporte((d) => ({ ...d, fechaRecogida: e.target.value }))}
                      className="w-full rounded-lg border border-sky-300 px-2 py-1.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-sky-800 mb-1">Horario</label>
                    <select
                      value={datosTransporte.franjaRecogida}
                      onChange={(e) => setDatosTransporte((d) => ({ ...d, franjaRecogida: e.target.value }))}
                      className="w-full rounded-lg border border-sky-300 px-2 py-1.5 text-sm"
                    >
                      {FRANJAS_RECOGIDA.map((f) => (
                        <option key={f.id} value={f.id}>{f.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] text-sky-800 mb-1">Tipo de bulto</label>
                    <select
                      value={datosTransporte.tipoBulto}
                      onChange={(e) => setDatosTransporte((d) => ({ ...d, tipoBulto: e.target.value }))}
                      className="w-full rounded-lg border border-sky-300 px-2 py-1.5 text-sm"
                    >
                      {TIPOS_BULTO.map((t) => (
                        <option key={t} value={t}>{TIPO_BULTO_LABELS[t]}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] text-sky-800 mb-1">Peso (kg)</label>
                    <input
                      type="number"
                      min={0}
                      step="0.1"
                      value={datosTransporte.bultoPesoKg}
                      onChange={(e) => setDatosTransporte((d) => ({ ...d, bultoPesoKg: e.target.value }))}
                      className="w-full rounded-lg border border-sky-300 px-2 py-1.5 text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] text-sky-800 mb-1">Dimensiones del bulto, en cm (no importa el orden)</label>
                  <div className="flex items-center gap-1.5">
                    <input type="number" min={0} placeholder="—" value={datosTransporte.bultoLargoCm} onChange={(e) => setDatosTransporte((d) => ({ ...d, bultoLargoCm: e.target.value }))} className="w-full min-w-0 rounded-lg border border-sky-300 px-2 py-1.5 text-sm text-center" />
                    <span className="text-sky-700 shrink-0">×</span>
                    <input type="number" min={0} placeholder="—" value={datosTransporte.bultoAnchoCm} onChange={(e) => setDatosTransporte((d) => ({ ...d, bultoAnchoCm: e.target.value }))} className="w-full min-w-0 rounded-lg border border-sky-300 px-2 py-1.5 text-sm text-center" />
                    <span className="text-sky-700 shrink-0">×</span>
                    <input type="number" min={0} placeholder="—" value={datosTransporte.bultoAltoCm} onChange={(e) => setDatosTransporte((d) => ({ ...d, bultoAltoCm: e.target.value }))} className="w-full min-w-0 rounded-lg border border-sky-300 px-2 py-1.5 text-sm text-center" />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] text-sky-800 mb-1">Ciudad de recogida</label>
                    <input value={datosTransporte.ciudadRecogida} onChange={(e) => setDatosTransporte((d) => ({ ...d, ciudadRecogida: e.target.value }))} className="w-full rounded-lg border border-sky-300 px-2 py-1.5 text-sm" />
                  </div>
                  <div>
                    <label className="block text-[11px] text-sky-800 mb-1">Ciudad de entrega</label>
                    <input value={datosTransporte.ciudadEntrega} onChange={(e) => setDatosTransporte((d) => ({ ...d, ciudadEntrega: e.target.value }))} className="w-full rounded-lg border border-sky-300 px-2 py-1.5 text-sm" />
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] text-sky-800 mb-1">Dirección de recogida</label>
                  <input value={datosTransporte.direccionRecogida} onChange={(e) => setDatosTransporte((d) => ({ ...d, direccionRecogida: e.target.value }))} className="w-full rounded-lg border border-sky-300 px-2 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="block text-[11px] text-sky-800 mb-1">Dirección de entrega</label>
                  <input value={datosTransporte.direccionEntrega} onChange={(e) => setDatosTransporte((d) => ({ ...d, direccionEntrega: e.target.value }))} className="w-full rounded-lg border border-sky-300 px-2 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="block text-[11px] text-sky-800 mb-1">Detalle para el transportista (pulgadas, mezcla de material…)</label>
                  <input
                    value={datosTransporte.detalleTransporte}
                    onChange={(e) => setDatosTransporte((d) => ({ ...d, detalleTransporte: e.target.value }))}
                    placeholder='ej. "TFTs de 32 y 43 pulgadas"'
                    className="w-full rounded-lg border border-sky-300 px-2 py-1.5 text-sm"
                  />
                </div>
                <div className="flex gap-2 justify-end">
                  <button
                    type="button"
                    onClick={() => setRellenandoId(null)}
                    className="text-xs text-slate-500 hover:underline px-2"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={guardandoDatos}
                    onClick={() => guardarDatosTransporte(envio.id)}
                    className="bg-sky-600 hover:bg-sky-700 text-white text-xs font-medium rounded-lg px-3 py-2 disabled:opacity-60"
                  >
                    {guardandoDatos ? "Guardando…" : "Guardar y avisar al transportista"}
                  </button>
                </div>
              </div>
            )}

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
