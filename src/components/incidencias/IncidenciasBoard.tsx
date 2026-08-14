"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import SerialNumberScanner from "@/components/SerialNumberScanner";
import WhatsAppButton from "./WhatsAppButton";
import IncidenciaDetalle, { IncidenciaDetalleData } from "./IncidenciaDetalle";
import {
  ESTADO_INCIDENCIA_LABELS,
  TIPO_INCIDENCIA_LABELS,
  TIPO_MATERIAL_LABELS,
} from "@/lib/constants";

type Foto = { id: string; url: string; fecha: string };
type MaterialUsado = { id: string; material: { codigoBarras: string; nombre: string; tipo: string } };
type Tecnico = { id: string; name: string; zona: string | null; phone: string | null };
type EstancoInfo = { nombre: string; comercial: string | null; correoComercial: string | null };
type TecnicoCercano = { id: string; name: string; zona: string | null; distanciaKm: number | null };

type Incidencia = IncidenciaDetalleData & {
  fotos: Foto[];
  materialesUsados: MaterialUsado[];
  estanco: EstancoInfo | null;
  tecnico: Tecnico | null;
};

const ESTADO_COLORS: Record<string, string> = {
  SIN_ASIGNAR: "bg-slate-200 text-slate-700",
  ASIGNADA: "bg-amber-100 text-amber-800",
  EN_CAMINO: "bg-blue-100 text-blue-800",
  RESUELTA: "bg-emerald-100 text-emerald-800",
};

const WHATSAPP_PHONE = process.env.NEXT_PUBLIC_WHATSAPP_PHONE || "34600000000";

/**
 * Selector de técnico que carga, para esa incidencia concreta, los técnicos
 * ordenados por distancia real al estanco (km en línea recta).
 */
function SelectorTecnicoCercano({
  incidenciaId,
  valor,
  onChange,
  tecnicosBase,
}: {
  incidenciaId: string;
  valor: string;
  onChange: (tecnicoId: string) => void;
  tecnicosBase: Tecnico[];
}) {
  const [tecnicos, setTecnicos] = useState<TecnicoCercano[] | null>(null);
  const [cargando, setCargando] = useState(false);
  const [motivo, setMotivo] = useState<string | null>(null);

  // Las distancias se calculan solo cuando se piden: geocodificar exige una
  // petición por dirección con límite de 1/segundo, así que hacerlo de golpe
  // para las 100+ incidencias de la bandeja bloquearía la vista.
  async function cargarDistancias() {
    if (tecnicos !== null || cargando) return;
    setCargando(true);
    try {
      const res = await fetch(`/api/incidencias/${incidenciaId}/tecnicos-cercanos`);
      const d = await res.json();
      setTecnicos(d.tecnicos || []);
      setMotivo(d.motivoSinDistancia || null);
    } catch {
      setTecnicos([]);
    } finally {
      setCargando(false);
    }
  }

  const lista: TecnicoCercano[] =
    tecnicos ?? tecnicosBase.map((t) => ({ id: t.id, name: t.name, zona: t.zona, distanciaKm: null }));

  return (
    <div>
      <select
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        className="text-xs rounded-lg border border-slate-300 px-2 py-2 w-full"
      >
        <option value="">Técnico…</option>
        {lista.map((t, idx) => (
          <option key={t.id} value={t.id}>
            {tecnicos !== null && idx === 0 && t.distanciaKm !== null ? "⭐ " : ""}
            {t.name}
            {t.zona ? ` · ${t.zona}` : ""}
            {t.distanciaKm !== null ? ` — ${t.distanciaKm} km` : ""}
          </option>
        ))}
      </select>
      {tecnicos === null ? (
        <button
          type="button"
          onClick={cargarDistancias}
          disabled={cargando}
          className="text-[10px] text-admira-600 hover:underline mt-1 disabled:opacity-60"
        >
          {cargando ? "Calculando distancias…" : "📍 Ver técnicos más cercanos (km)"}
        </button>
      ) : (
        motivo && <p className="text-[10px] text-slate-400 mt-1">{motivo}</p>
      )}
    </div>
  );
}

function BandejaSinAsignar({
  incidencias,
  onAsignado,
  onVerDetalle,
}: {
  incidencias: Incidencia[];
  onAsignado: () => void;
  onVerDetalle: (inc: Incidencia) => void;
}) {
  const [seleccion, setSeleccion] = useState<Record<string, string>>({});
  const [asignando, setAsignando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tecnicosBase, setTecnicosBase] = useState<Tecnico[]>([]);
  const [ventanaDias, setVentanaDias] = useState<number | null>(null);
  const [cargandoMas, setCargandoMas] = useState(false);
  const [mensajeMostrarMas, setMensajeMostrarMas] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/tecnicos")
      .then((r) => r.json())
      .then((d) => setTecnicosBase(d.tecnicos || []));
    fetch("/api/desk/sync")
      .then((r) => r.json())
      .then((d) => setVentanaDias(d.ventanaDias ?? null));
  }, []);

  async function mostrarMas() {
    setCargandoMas(true);
    setMensajeMostrarMas(null);
    const res = await fetch("/api/desk/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ampliarVentana: true }),
    });
    const data = await res.json();
    setCargandoMas(false);
    if (!res.ok) {
      setMensajeMostrarMas(data.error || "Error al pedir más tickets del desk.");
      return;
    }
    setVentanaDias(data.ventanaDias ?? null);
    setMensajeMostrarMas(
      data.nuevas > 0 ? `Se han traído ${data.nuevas} tickets más antiguos.` : "No hay tickets más antiguos que traer."
    );
    onAsignado();
  }

  async function asignar(id: string) {
    const tecnicoId = seleccion[id];
    if (!tecnicoId) {
      setError("Selecciona un técnico antes de asignar.");
      return;
    }
    setAsignando(id);
    setError(null);
    const res = await fetch(`/api/incidencias/${id}/asignar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tecnicoId }),
    });
    const data = await res.json();
    setAsignando(null);
    if (!res.ok) {
      setError(data.error || "Error al asignar.");
      return;
    }
    onAsignado();
  }

  const botonMostrarMas = (
    <div className="mt-3 text-center">
      <button
        onClick={mostrarMas}
        disabled={cargandoMas}
        className="text-xs font-medium bg-slate-700 hover:bg-slate-800 text-white rounded-lg px-3 py-2 disabled:opacity-60"
      >
        {cargandoMas ? "Buscando tickets más antiguos…" : "⬇️ Mostrar más"}
      </button>
      {ventanaDias != null && (
        <p className="text-[11px] text-slate-400 mt-1">
          Mostrando tickets de los últimos {ventanaDias} días. Pulsa para traer más antiguos.
        </p>
      )}
      {mensajeMostrarMas && <p className="text-[11px] text-amber-700 mt-1">{mensajeMostrarMas}</p>}
    </div>
  );

  if (incidencias.length === 0) {
    return (
      <div>
        <p className="text-sm text-slate-400 py-6 text-center">No hay incidencias sin asignar.</p>
        {botonMostrarMas}
      </div>
    );
  }

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
      <p className="text-xs text-amber-700 mb-3">
        Tickets importados automáticamente que requieren visita in situ (solo del último mes; usa "Mostrar más" para
        traer tickets más antiguos). El selector propone primero los técnicos más cercanos al estanco, con la
        distancia aproximada.
      </p>
      {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
      <div className="space-y-2">
        {incidencias.map((inc) => (
          <div key={inc.id} className="bg-white rounded-lg p-3 flex flex-col sm:flex-row sm:items-center gap-2 justify-between">
            <button onClick={() => onVerDetalle(inc)} className="min-w-0 text-left hover:opacity-75 transition-opacity">
              <div className="text-sm font-medium text-slate-800 truncate">{inc.titulo}</div>
              <div className="text-xs text-slate-500">
                {inc.ticketExternoId && <>Ticket {inc.ticketExternoId} · </>}
                {inc.cliente}
              </div>
              {inc.descripcion && <div className="text-[11px] text-slate-400">{inc.descripcion}</div>}
              {inc.estanco ? (
                <div className="text-[11px] text-emerald-700">
                  🏪 {inc.estanco.nombre}
                  {inc.estanco.comercial ? ` · ${inc.estanco.comercial}` : ""}
                </div>
              ) : (
                <div className="text-[11px] text-slate-300">Sin coincidencia de estanco</div>
              )}
              <div className="text-[10px] text-admira-600 mt-0.5">Ver detalle →</div>
            </button>
            <div className="flex gap-2 shrink-0 sm:w-72">
              <div className="flex-1">
                <SelectorTecnicoCercano
                  incidenciaId={inc.id}
                  valor={seleccion[inc.id] || ""}
                  onChange={(tecnicoId) => setSeleccion((s) => ({ ...s, [inc.id]: tecnicoId }))}
                  tecnicosBase={tecnicosBase}
                />
              </div>
              <button
                onClick={() => asignar(inc.id)}
                disabled={asignando === inc.id}
                className="bg-admira-600 text-white text-xs font-medium rounded-lg px-3 py-2 disabled:opacity-60 self-start"
              >
                {asignando === inc.id ? "Asignando…" : "Asignar"}
              </button>
            </div>
          </div>
        ))}
      </div>
      {botonMostrarMas}
    </div>
  );
}

function ProgramarVisita({ incidenciaId, onProgramada }: { incidenciaId: string; onProgramada: () => void }) {
  const [fechaHora, setFechaHora] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar() {
    if (!fechaHora) {
      setError("Elige día y hora.");
      return;
    }
    setGuardando(true);
    setError(null);
    const res = await fetch(`/api/incidencias/${incidenciaId}/programar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fechaHora }),
    });
    const data = await res.json();
    setGuardando(false);
    if (!res.ok) {
      setError(data.error || "Error al programar la visita.");
      return;
    }
    onProgramada();
  }

  return (
    <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg p-3">
      <div className="text-xs font-medium text-amber-900 mb-2">
        📅 Programa el día y la hora de la visita — se avisará automáticamente al comercial del estanco.
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        <input
          type="datetime-local"
          value={fechaHora}
          onChange={(e) => setFechaHora(e.target.value)}
          className="text-xs rounded-lg border border-slate-300 px-2 py-2"
        />
        <button
          onClick={guardar}
          disabled={guardando}
          className="bg-amber-600 text-white text-xs font-medium rounded-lg px-3 py-2 disabled:opacity-60"
        >
          {guardando ? "Guardando…" : "Programar visita"}
        </button>
      </div>
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  );
}

export default function IncidenciasBoard({ role }: { role: "TECNICO" | "ADMIRA" }) {
  const [incidencias, setIncidencias] = useState<Incidencia[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanTarget, setScanTarget] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const [sincronizando, setSincronizando] = useState(false);
  const [vista, setVista] = useState<"SIN_ASIGNAR" | "ASIGNADAS">("SIN_ASIGNAR");
  const [detalle, setDetalle] = useState<Incidencia | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});

  const load = useCallback(async () => {
    const res = await fetch("/api/incidencias");
    const data = await res.json();
    setIncidencias(data.incidencias || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function sincronizarDesk() {
    setSincronizando(true);
    const res = await fetch("/api/desk/sync", { method: "POST" });
    const data = await res.json();
    setSincronizando(false);
    // Aunque el desk falle, la parte de pantallas desconectadas puede haber
    // funcionado igual (usa otra API): siempre se refresca la lista.
    load();
    if (!res.ok) {
      setFeedback({
        type: "error",
        text: `${data.error || "Error al sincronizar con el desk."}${
          data.nuevas || data.actualizadas ? ` (pantallas desconectadas: ${data.nuevas} nuevas, ${data.actualizadas} actualizadas)` : ""
        }`,
      });
      return;
    }
    setFeedback({ type: "ok", text: `Sincronizado: ${data.nuevas} nuevas, ${data.actualizadas} actualizadas.` });
  }

  async function setEstado(id: string, estado: "EN_CAMINO" | "RESUELTA") {
    const res = await fetch(`/api/incidencias/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estado }),
    });
    const data = await res.json();
    if (!res.ok) {
      setFeedback({ type: "error", text: data.error });
      return;
    }
    load();
  }

  async function handleScanMaterial(code: string) {
    if (!scanTarget) return;
    const res = await fetch(`/api/incidencias/${scanTarget}/material`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ codigoBarras: code }),
    });
    const data = await res.json();
    if (!res.ok) {
      setFeedback({ type: "error", text: data.error });
      return;
    }
    setFeedback({ type: "ok", text: `Material ${data.registro.material.nombre} marcado como instalado.` });
    setScanTarget(null);
    load();
  }

  async function handleUploadPhoto(id: string, file: File) {
    const formData = new FormData();
    formData.append("foto", file);
    const res = await fetch(`/api/incidencias/${id}/fotos`, { method: "POST", body: formData });
    if (!res.ok) {
      setFeedback({ type: "error", text: "Error al subir la foto." });
      return;
    }
    load();
  }

  if (loading) return <p className="text-sm text-slate-400 py-4">Cargando incidencias…</p>;

  const sinAsignar = incidencias.filter((i) => i.estado === "SIN_ASIGNAR");
  const asignadas = incidencias.filter((i) => i.estado !== "SIN_ASIGNAR");

  // Para el técnico no hay bandeja "sin asignar": solo ve las suyas ya asignadas.
  const listaBase = role === "ADMIRA" ? (vista === "SIN_ASIGNAR" ? sinAsignar : asignadas) : asignadas;

  const q = busqueda.trim().toLowerCase();
  const visibles = q
    ? listaBase.filter(
        (i) =>
          i.titulo.toLowerCase().includes(q) ||
          (i.cliente || "").toLowerCase().includes(q) ||
          (i.ticketExternoId || "").toLowerCase().includes(q) ||
          (i.tecnico?.name || "").toLowerCase().includes(q) ||
          (i.estanco?.nombre || "").toLowerCase().includes(q)
      )
    : listaBase;

  return (
    <div className="space-y-3">
      {feedback && (
        <div className={`text-sm rounded-lg px-3 py-2 ${feedback.type === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
          {feedback.text}
        </div>
      )}

      {role === "ADMIRA" && (
        <>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex gap-2">
              <button
                onClick={() => setVista("SIN_ASIGNAR")}
                className={`text-xs font-medium rounded-lg px-3 py-2 transition-colors ${
                  vista === "SIN_ASIGNAR" ? "bg-admira-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                Sin asignar ({sinAsignar.length})
              </button>
              <button
                onClick={() => setVista("ASIGNADAS")}
                className={`text-xs font-medium rounded-lg px-3 py-2 transition-colors ${
                  vista === "ASIGNADAS" ? "bg-admira-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                Asignadas ({asignadas.length})
              </button>
            </div>
            <button
              onClick={sincronizarDesk}
              disabled={sincronizando}
              className="text-xs font-medium bg-slate-700 hover:bg-slate-800 text-white rounded-lg px-3 py-2 disabled:opacity-60"
            >
              {sincronizando ? "Sincronizando…" : "🔄 Sincronizar con el desk ahora"}
            </button>
          </div>

          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por título, cliente, ticket, técnico o estanco…"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </>
      )}

      {role === "ADMIRA" && vista === "SIN_ASIGNAR" && (
        <BandejaSinAsignar incidencias={visibles} onAsignado={load} onVerDetalle={setDetalle} />
      )}

      {(role === "TECNICO" || vista === "ASIGNADAS") && (
        <>
          {visibles.length === 0 && (
            <p className="text-sm text-slate-400 py-6 text-center">
              {listaBase.length === 0 ? "No hay incidencias." : "Ninguna incidencia coincide con la búsqueda."}
            </p>
          )}
          {visibles.map((inc) => (
            <div key={inc.id} className="bg-white rounded-xl shadow-sm border border-slate-100 p-4">
              <div className="flex items-start justify-between gap-2">
                <button onClick={() => setDetalle(inc)} className="text-left min-w-0 hover:opacity-75 transition-opacity">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-slate-800">{inc.titulo}</span>
                    <span className={`text-[11px] rounded-full px-2 py-0.5 ${ESTADO_COLORS[inc.estado]}`}>
                      {ESTADO_INCIDENCIA_LABELS[inc.estado as keyof typeof ESTADO_INCIDENCIA_LABELS]}
                    </span>
                    <span className="text-[11px] bg-slate-100 text-slate-600 rounded-full px-2 py-0.5">
                      {TIPO_INCIDENCIA_LABELS[inc.tipo as keyof typeof TIPO_INCIDENCIA_LABELS]}
                    </span>
                    {inc.origen === "DESK" && (
                      <span className="text-[11px] bg-indigo-100 text-indigo-700 rounded-full px-2 py-0.5">Desk</span>
                    )}
                    {inc.origen === "HARDWARE" && (
                      <span className="text-[11px] bg-rose-100 text-rose-700 rounded-full px-2 py-0.5">
                        Pantalla desconectada
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    {inc.ticketExternoId && <>Ticket {inc.ticketExternoId} · </>}
                    {inc.cliente} {inc.direccion ? `· ${inc.direccion}` : ""}
                  </div>
                  {inc.descripcion && <div className="text-xs text-slate-500 mt-1">{inc.descripcion}</div>}
                  {role === "ADMIRA" && inc.tecnico && (
                    <div className="text-xs text-slate-400 mt-1">
                      Técnico: {inc.tecnico.name}
                      {inc.tecnico.zona ? ` (${inc.tecnico.zona})` : ""}
                    </div>
                  )}
                  {inc.estanco ? (
                    <div className="text-[11px] text-slate-400 mt-1">
                      🏪 {inc.estanco.nombre}
                      {inc.estanco.comercial ? ` · Comercial: ${inc.estanco.comercial}` : ""}
                    </div>
                  ) : (
                    <div className="text-[11px] text-slate-300 mt-1">Sin estanco del directorio vinculado</div>
                  )}
                  {inc.fechaVisitaProgramada && (
                    <div className="text-[11px] text-amber-700 mt-1">
                      📅 Visita programada:{" "}
                      {new Date(inc.fechaVisitaProgramada).toLocaleString("es-ES", { dateStyle: "medium", timeStyle: "short" })}
                    </div>
                  )}
                  <div className="text-[10px] text-admira-600 mt-1">Ver todos los detalles →</div>
                </button>
              </div>

              {role === "TECNICO" && inc.estado === "ASIGNADA" && !inc.fechaVisitaProgramada && (
                <ProgramarVisita incidenciaId={inc.id} onProgramada={load} />
              )}

              {role === "TECNICO" && inc.estado !== "RESUELTA" && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {inc.estado === "ASIGNADA" && inc.fechaVisitaProgramada && (
                    <button onClick={() => setEstado(inc.id, "EN_CAMINO")} className="bg-blue-600 text-white text-xs font-medium rounded-lg px-3 py-2">
                      ✅ Voy en camino
                    </button>
                  )}
                  {inc.estado === "EN_CAMINO" && (
                    <button onClick={() => setEstado(inc.id, "RESUELTA")} className="bg-emerald-600 text-white text-xs font-medium rounded-lg px-3 py-2">
                      ✅ Marcar resuelta
                    </button>
                  )}
                  <button onClick={() => setScanTarget(inc.id)} className="bg-admira-600 text-white text-xs font-medium rounded-lg px-3 py-2">
                    📷 Escanear material instalado
                  </button>
                  <button
                    onClick={() => fileInputs.current[inc.id]?.click()}
                    className="bg-slate-700 text-white text-xs font-medium rounded-lg px-3 py-2"
                  >
                    🖼️ Subir foto evidencia
                  </button>
                  <input
                    ref={(el) => {
                      fileInputs.current[inc.id] = el;
                    }}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleUploadPhoto(inc.id, f);
                      e.target.value = "";
                    }}
                  />
                  {inc.tipo === "INSTALACION_NUEVA" && (
                    <WhatsAppButton
                      phone={WHATSAPP_PHONE}
                      text={`Hola, os envío la foto del código QR de Admira de la nueva instalación: "${inc.titulo}" (${inc.cliente || ""}).`}
                      label="Enviar foto QR de Admira"
                    />
                  )}
                </div>
              )}

              {(inc.fotos.length > 0 || inc.materialesUsados.length > 0) && (
                <div className="mt-3 grid gap-2">
                  {inc.fotos.length > 0 && (
                    <div className="flex gap-2 flex-wrap">
                      {inc.fotos.map((f) => (
                        <a key={f.id} href={f.url} target="_blank" rel="noopener noreferrer">
                          <img src={f.url} alt="Evidencia" className="w-16 h-16 object-cover rounded-lg border border-slate-200" />
                        </a>
                      ))}
                    </div>
                  )}
                  {inc.materialesUsados.length > 0 && (
                    <div className="text-xs text-slate-500">
                      Material instalado:{" "}
                      {inc.materialesUsados
                        .map(
                          (m) =>
                            `${TIPO_MATERIAL_LABELS[m.material.tipo as keyof typeof TIPO_MATERIAL_LABELS] || m.material.tipo} (${m.material.codigoBarras})`
                        )
                        .join(", ")}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </>
      )}

      {scanTarget && <SerialNumberScanner onScan={handleScanMaterial} onClose={() => setScanTarget(null)} />}
      {detalle && (
        <IncidenciaDetalle
          incidencia={detalle}
          role={role}
          onClose={() => setDetalle(null)}
          onActualizada={(actualizada) => {
            setDetalle((prev) => (prev ? { ...prev, estanco: actualizada.estanco ?? null } : prev));
            load();
          }}
        />
      )}
    </div>
  );
}
