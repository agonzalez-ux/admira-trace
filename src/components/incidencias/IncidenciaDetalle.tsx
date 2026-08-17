"use client";

import { useState } from "react";
import {
  ESTADO_INCIDENCIA_LABELS,
  TIPO_INCIDENCIA_LABELS,
  TIPO_MATERIAL_LABELS,
} from "@/lib/constants";
import WhatsAppButton from "./WhatsAppButton";
import { obtenerNumeroWhatsAppRotativo, generarMensajeInstalacion } from "@/lib/whatsapp";

export type IncidenciaDetalleData = {
  id: string;
  ticketExternoId: string | null;
  origen: string;
  deskProyecto?: string | null;
  deskEstado?: string | null;
  titulo: string;
  descripcion: string | null;
  tipo: string;
  cliente: string | null;
  direccion: string | null;
  estado: string;
  fechaAsignacion: string | null;
  fechaEnCamino: string | null;
  fechaResuelta: string | null;
  fechaVisitaProgramada?: string | null;
  fechaImportada?: string | null;
  tecnico: { id: string; name: string; zona: string | null; phone: string | null } | null;
  creadoPor?: { name: string } | null;
  estanco?: {
    nombre: string;
    comercial: string | null;
    telefonoComercial: string | null;
    correoComercial: string | null;
  } | null;
  fotos: { id: string; url: string }[];
  materialesUsados: { id: string; material: { codigoBarras: string; nombre: string; tipo: string } }[];
};

type EstancoResultado = { id: string; idEstanco: string; nombre: string; municipio: string | null; provincia: string | null };

/**
 * Buscador + botón para vincular a mano el estanco de una incidencia cuando
 * el emparejador automático del desk no lo encontró.
 */
function VincularEstanco({
  incidenciaId,
  onVinculado,
}: {
  incidenciaId: string;
  onVinculado: (incidencia: IncidenciaDetalleData) => void;
}) {
  const [q, setQ] = useState("");
  const [resultados, setResultados] = useState<EstancoResultado[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function buscar(texto: string) {
    setQ(texto);
    setError(null);
    if (texto.trim().length < 2) {
      setResultados([]);
      return;
    }
    setBuscando(true);
    const res = await fetch(`/api/estancos/buscar?q=${encodeURIComponent(texto.trim())}`);
    const data = await res.json();
    setResultados(data.estancos || []);
    setBuscando(false);
  }

  async function vincular(estancoId: string) {
    setGuardando(true);
    setError(null);
    const res = await fetch(`/api/incidencias/${incidenciaId}/estanco`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estancoId }),
    });
    const data = await res.json();
    setGuardando(false);
    if (!res.ok) return setError(data.error || "Error al vincular el estanco.");
    onVinculado(data.incidencia);
  }

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5">
      <p className="text-xs text-amber-800 mb-1.5">
        Esta incidencia no está vinculada a ningún estanco (el emparejador automático no lo encontró). Búscalo a mano
        para poder calcular la distancia al técnico y avisar al comercial.
      </p>
      <input
        value={q}
        onChange={(e) => buscar(e.target.value)}
        placeholder="Buscar por nombre, código o municipio…"
        className="w-full rounded-lg border border-amber-300 px-2 py-1.5 text-xs"
        disabled={guardando}
      />
      {buscando && <p className="text-[11px] text-amber-700 mt-1">Buscando…</p>}
      {error && <p className="text-[11px] text-red-600 mt-1">{error}</p>}
      {resultados.length > 0 && (
        <div className="mt-1.5 space-y-1 max-h-40 overflow-y-auto">
          {resultados.map((e) => (
            <button
              key={e.id}
              onClick={() => vincular(e.id)}
              disabled={guardando}
              className="w-full text-left text-xs bg-white hover:bg-amber-100 rounded-lg px-2 py-1.5 disabled:opacity-60"
            >
              <span className="font-medium text-slate-700">{e.nombre}</span>
              <span className="text-slate-400">
                {" "}
                · {e.idEstanco}
                {e.municipio ? ` · ${e.municipio}` : ""}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const ESTADO_COLORS: Record<string, string> = {
  SIN_ASIGNAR: "bg-slate-200 text-slate-700",
  ASIGNADA: "bg-amber-100 text-amber-800",
  EN_CAMINO: "bg-blue-100 text-blue-800",
  RESUELTA: "bg-emerald-100 text-emerald-800",
};

function fmt(fecha: string | null | undefined) {
  if (!fecha) return null;
  return new Date(fecha).toLocaleString("es-ES", { dateStyle: "medium", timeStyle: "short" });
}

/** Línea de tiempo del proceso, para poder trackear en qué punto está. */
function Timeline({ inc }: { inc: IncidenciaDetalleData }) {
  const pasos = [
    { label: "Importada / creada", fecha: fmt(inc.fechaImportada) },
    { label: "Asignada al técnico", fecha: fmt(inc.fechaAsignacion) },
    { label: "Visita programada", fecha: fmt(inc.fechaVisitaProgramada) },
    { label: "Técnico en camino", fecha: fmt(inc.fechaEnCamino) },
    { label: "Resuelta", fecha: fmt(inc.fechaResuelta) },
  ];

  return (
    <div className="space-y-1.5">
      {pasos.map((p) => (
        <div key={p.label} className="flex items-start gap-2 text-xs">
          <span className={`mt-1 w-2 h-2 rounded-full shrink-0 ${p.fecha ? "bg-emerald-500" : "bg-slate-300"}`} />
          <div className="min-w-0">
            <span className={p.fecha ? "text-slate-700" : "text-slate-400"}>{p.label}</span>
            {p.fecha && <span className="text-slate-400"> · {p.fecha}</span>}
            {!p.fecha && <span className="text-slate-300"> · pendiente</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function IncidenciaDetalle({
  incidencia,
  role,
  onClose,
  onActualizada,
}: {
  incidencia: IncidenciaDetalleData;
  role: "TECNICO" | "ADMIRA";
  onClose: () => void;
  onActualizada?: (incidencia: IncidenciaDetalleData) => void;
}) {
  const inc = incidencia;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-5">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            <h2 className="font-bold text-lg text-slate-800">{inc.titulo}</h2>
            <div className="flex items-center gap-2 flex-wrap mt-1">
              <span className={`text-[11px] rounded-full px-2 py-0.5 ${ESTADO_COLORS[inc.estado] || "bg-slate-100"}`}>
                {ESTADO_INCIDENCIA_LABELS[inc.estado as keyof typeof ESTADO_INCIDENCIA_LABELS] || inc.estado}
              </span>
              <span className="text-[11px] bg-slate-100 text-slate-600 rounded-full px-2 py-0.5">
                {TIPO_INCIDENCIA_LABELS[inc.tipo as keyof typeof TIPO_INCIDENCIA_LABELS] || inc.tipo}
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
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl leading-none shrink-0">
            ×
          </button>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-3">
            <div>
              <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1">Datos del ticket</h3>
              <dl className="text-xs space-y-0.5">
                {inc.ticketExternoId && (
                  <div className="flex gap-1">
                    <dt className="text-slate-400">Ticket:</dt>
                    <dd className="text-slate-700">{inc.ticketExternoId}</dd>
                  </div>
                )}
                {inc.deskProyecto && (
                  <div className="flex gap-1">
                    <dt className="text-slate-400">Proyecto:</dt>
                    <dd className="text-slate-700">{inc.deskProyecto}</dd>
                  </div>
                )}
                {inc.deskEstado && (
                  <div className="flex gap-1">
                    <dt className="text-slate-400">Estado en el desk:</dt>
                    <dd className="text-slate-700">{inc.deskEstado}</dd>
                  </div>
                )}
                {inc.cliente && (
                  <div className="flex gap-1">
                    <dt className="text-slate-400">Cliente:</dt>
                    <dd className="text-slate-700">{inc.cliente}</dd>
                  </div>
                )}
                {inc.direccion && (
                  <div>
                    <dt className="text-slate-400">Dirección / referencia:</dt>
                    <dd className="text-slate-700 break-words">{inc.direccion}</dd>
                  </div>
                )}
              </dl>
            </div>

            <div>
              <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1">Responsables</h3>
              <dl className="text-xs space-y-0.5">
                <div className="flex gap-1">
                  <dt className="text-slate-400">Técnico:</dt>
                  <dd className="text-slate-700">
                    {inc.tecnico ? `${inc.tecnico.name}${inc.tecnico.zona ? ` (${inc.tecnico.zona})` : ""}` : "Sin asignar"}
                  </dd>
                </div>
                {inc.tecnico?.phone && (
                  <div className="flex gap-1">
                    <dt className="text-slate-400">Teléfono técnico:</dt>
                    <dd className="text-slate-700">{inc.tecnico.phone}</dd>
                  </div>
                )}
                <div className="flex gap-1">
                  <dt className="text-slate-400">Asignada por:</dt>
                  <dd className="text-slate-700">{inc.creadoPor?.name || "—"}</dd>
                </div>
                {inc.estanco && (
                  <>
                    <div className="flex gap-1">
                      <dt className="text-slate-400">Estanco:</dt>
                      <dd className="text-slate-700">{inc.estanco.nombre}</dd>
                    </div>
                    <div className="flex gap-1">
                      <dt className="text-slate-400">Comercial:</dt>
                      <dd className="text-slate-700">{inc.estanco.comercial || "—"}</dd>
                    </div>
                    {inc.estanco.telefonoComercial && (
                      <div className="flex gap-1">
                        <dt className="text-slate-400">Teléfono comercial:</dt>
                        <dd className="text-slate-700">
                          <a href={`tel:${inc.estanco.telefonoComercial}`} className="text-admira-600 hover:underline">
                            {inc.estanco.telefonoComercial}
                          </a>
                        </dd>
                      </div>
                    )}
                    {inc.estanco.correoComercial && (
                      <div>
                        <dt className="text-slate-400">Email comercial:</dt>
                        <dd className="text-slate-700 break-all">
                          <a href={`mailto:${inc.estanco.correoComercial}`} className="text-admira-600 hover:underline">
                            {inc.estanco.correoComercial}
                          </a>
                        </dd>
                      </div>
                    )}
                  </>
                )}
              </dl>
            </div>

            {!inc.estanco && role === "ADMIRA" && onActualizada && (
              <VincularEstanco incidenciaId={inc.id} onVinculado={onActualizada} />
            )}

            {/* Botón de WhatsApp para instalaciones: lo usa el propio técnico
                para enviar a Admira la foto del QR, sin salir de la incidencia. */}
            {inc.tipo === "INSTALACION_NUEVA" && inc.tecnico && role === "TECNICO" && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                <p className="text-xs text-emerald-800 mb-2">
                  💬 Envía a Admira la foto del QR de esta instalación por WhatsApp:
                </p>
                <WhatsAppButton
                  phone={obtenerNumeroWhatsAppRotativo(inc.id)}
                  text={generarMensajeInstalacion({
                    tecnicoNombre: inc.tecnico.name,
                    estancoNombre: inc.estanco?.nombre,
                    estancoDireccion: inc.direccion ?? undefined,
                  })}
                  label="📤 Enviar QR Admira"
                />
              </div>
            )}

            {inc.descripcion && (
              <div>
                <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1">Descripción</h3>
                <p className="text-xs text-slate-600">{inc.descripcion}</p>
              </div>
            )}
          </div>

          <div className="space-y-3">
            <div>
              <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">Seguimiento del proceso</h3>
              <Timeline inc={inc} />
            </div>

            <div>
              <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1">
                Material instalado ({inc.materialesUsados.length})
              </h3>
              {inc.materialesUsados.length === 0 ? (
                <p className="text-xs text-slate-400">Todavía no se ha escaneado ningún material.</p>
              ) : (
                <div className="space-y-1">
                  {inc.materialesUsados.map((m) => (
                    <div key={m.id} className="text-xs bg-slate-50 rounded-lg px-2 py-1.5">
                      <span className="font-mono text-slate-600">{m.material.codigoBarras}</span>
                      <span className="text-slate-500">
                        {" · "}
                        {TIPO_MATERIAL_LABELS[m.material.tipo as keyof typeof TIPO_MATERIAL_LABELS] || m.material.tipo} ·{" "}
                        {m.material.nombre}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1">
                Fotos de evidencia ({inc.fotos.length})
              </h3>
              {inc.fotos.length === 0 ? (
                <p className="text-xs text-slate-400">Sin fotos todavía.</p>
              ) : (
                <div className="flex gap-2 flex-wrap">
                  {inc.fotos.map((f) => (
                    <a key={f.id} href={f.url} target="_blank" rel="noopener noreferrer">
                      <img src={f.url} alt="Evidencia" className="w-20 h-20 object-cover rounded-lg border border-slate-200" />
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
