"use client";

import { useState, Fragment } from "react";
import {
  ESTADO_INCIDENCIA_LABELS,
  TIPO_INCIDENCIA_LABELS,
  TIPO_MATERIAL_LABELS,
  ESTADO_VIABILIDAD_LABELS,
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
  fechaEnSitio?: string | null;
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
  materialesUsados: { id: string; material: { numeroSerie: string; nombre: string; tipo: string } }[];
  viabilidadEstado?: string;
  viabilidadRespuesta?: {
    materialConfirmado: boolean;
    materialCorreccion: string | null;
    tipoUbicacion: string;
    medidasAncho: number | null;
    medidasAlto: number | null;
    medidasFondo: number | null;
    puntosElectricosCercanos: boolean;
    puntosElectricosComentario: string | null;
    sePuedeTaladrar: boolean;
    comentarios: string | null;
    respondidoPorNombre: string | null;
    respondidoEn: string;
  } | null;
  viabilidadFotos?: { id: string; url: string }[];
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

/**
 * Visor a pantalla completa de una foto: se abre al clicar una miniatura y
 * se cierra tocando el fondo negro de alrededor (o la propia foto), sin
 * salir del detalle de la incidencia — antes se abría en pestaña nueva del
 * navegador, de la que no había forma clara de "volver".
 */
function VisorFoto({ url, onClose }: { url: string | null; onClose: () => void }) {
  if (!url) return null;
  return (
    <div
      className="fixed inset-0 bg-black/90 z-[60] flex items-center justify-center p-4 cursor-zoom-out"
      onClick={onClose}
    >
      <img
        src={url}
        alt="Foto ampliada"
        onClick={(e) => e.stopPropagation()}
        className="max-w-full max-h-full object-contain rounded-lg cursor-default"
      />
    </div>
  );
}

/**
 * Panel de viabilidad de instalación: muestra la respuesta del comercial (si
 * ya la hay) y deja a Admira marcar viable/no viable, o reenviar el
 * formulario si sigue sin respuesta.
 */
function PanelViabilidad({
  inc,
  role,
  onActualizada,
  onAbrirFoto,
}: {
  inc: IncidenciaDetalleData;
  role: "TECNICO" | "ADMIRA";
  onActualizada?: (incidencia: IncidenciaDetalleData) => void;
  onAbrirFoto: (url: string) => void;
}) {
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reenviado, setReenviado] = useState(false);

  if (role !== "ADMIRA" || !onActualizada) {
    return (
      <span className="text-[11px] rounded-full px-2 py-0.5 bg-amber-100 text-amber-800">
        Viabilidad: {ESTADO_VIABILIDAD_LABELS[inc.viabilidadEstado as keyof typeof ESTADO_VIABILIDAD_LABELS] || inc.viabilidadEstado}
      </span>
    );
  }

  async function decidir(decision: "VIABLE" | "NO_VIABLE") {
    setCargando(true);
    setError(null);
    const res = await fetch(`/api/incidencias/${inc.id}/viabilidad`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accion: "decidir", decision }),
    });
    setCargando(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "No se ha podido guardar la decisión.");
      return;
    }
    onActualizada!({ ...inc, viabilidadEstado: decision });
  }

  async function reenviar() {
    setCargando(true);
    setError(null);
    const res = await fetch(`/api/incidencias/${inc.id}/viabilidad`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accion: "reenviar" }),
    });
    setCargando(false);
    if (!res.ok) {
      setError("No se ha podido reenviar el formulario.");
      return;
    }
    setReenviado(true);
  }

  const r = inc.viabilidadRespuesta;

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Viabilidad de instalación</h3>
        <span className="text-[11px] rounded-full px-2 py-0.5 bg-amber-100 text-amber-800">
          {ESTADO_VIABILIDAD_LABELS[inc.viabilidadEstado as keyof typeof ESTADO_VIABILIDAD_LABELS] || inc.viabilidadEstado}
        </span>
      </div>

      {inc.viabilidadEstado === "PENDIENTE_RESPUESTA" && (
        <div className="text-xs text-slate-600 space-y-1.5">
          <p>Todavía no ha respondido el comercial.</p>
          <button
            onClick={reenviar}
            disabled={cargando || reenviado}
            className="text-xs font-medium bg-slate-700 hover:bg-slate-800 text-white rounded-lg px-3 py-1.5 disabled:opacity-60"
          >
            {reenviado ? "Formulario reenviado" : "Reenviar formulario"}
          </button>
        </div>
      )}

      {r && (
        <dl className="text-xs space-y-1">
          <div className="flex gap-1">
            <dt className="text-slate-400">Material confirmado:</dt>
            <dd className="text-slate-700">{r.materialConfirmado ? "Sí" : `No — ${r.materialCorreccion || "sin detalle"}`}</dd>
          </div>
          <div className="flex gap-1">
            <dt className="text-slate-400">Ubicación:</dt>
            <dd className="text-slate-700">
              {r.tipoUbicacion === "HUECO" ? "Hueco" : "Pared"}
              {r.tipoUbicacion === "HUECO" && r.medidasAncho ? ` — ${r.medidasAncho} x ${r.medidasAlto} x ${r.medidasFondo} cm` : ""}
            </dd>
          </div>
          <div className="flex gap-1">
            <dt className="text-slate-400">Puntos eléctricos cerca:</dt>
            <dd className="text-slate-700">
              {r.puntosElectricosCercanos ? `Sí${r.puntosElectricosComentario ? ` — ${r.puntosElectricosComentario}` : ""}` : "No"}
            </dd>
          </div>
          <div className="flex gap-1">
            <dt className="text-slate-400">Se puede taladrar:</dt>
            <dd className="text-slate-700">{r.sePuedeTaladrar ? "Sí" : "No"}</dd>
          </div>
          {r.comentarios && (
            <div>
              <dt className="text-slate-400">Comentarios:</dt>
              <dd className="text-slate-700">{r.comentarios}</dd>
            </div>
          )}
          <div className="flex gap-1">
            <dt className="text-slate-400">Respondido por:</dt>
            <dd className="text-slate-700">{r.respondidoPorNombre || "—"} · {fmt(r.respondidoEn)}</dd>
          </div>
        </dl>
      )}

      {inc.viabilidadFotos && inc.viabilidadFotos.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {inc.viabilidadFotos.map((f) => (
            <button key={f.id} type="button" onClick={() => onAbrirFoto(f.url)}>
              <img src={f.url} alt="Sitio de instalación" className="w-20 h-20 object-cover rounded-lg border border-slate-200" />
            </button>
          ))}
        </div>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}

      {inc.viabilidadEstado === "RESPONDIDO" && (
        <div className="flex gap-2 pt-1">
          <button
            onClick={() => decidir("VIABLE")}
            disabled={cargando}
            className="flex-1 text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg py-1.5 disabled:opacity-60"
          >
            ✓ Marcar viable
          </button>
          <button
            onClick={() => decidir("NO_VIABLE")}
            disabled={cargando}
            className="flex-1 text-xs font-medium bg-red-600 hover:bg-red-700 text-white rounded-lg py-1.5 disabled:opacity-60"
          >
            ✗ No viable
          </button>
        </div>
      )}
    </div>
  );
}

const ESTADO_COLORS: Record<string, string> = {
  SIN_ASIGNAR: "bg-slate-200 text-slate-700",
  ASIGNADA: "bg-amber-100 text-amber-800",
  EN_CAMINO: "bg-blue-100 text-blue-800",
  EN_SITIO: "bg-indigo-100 text-indigo-800",
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
    { label: "Técnico en el estanco", fecha: fmt(inc.fechaEnSitio) },
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
  const [fotoAmpliada, setFotoAmpliada] = useState<string | null>(null);

  return (
    <Fragment>
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
                      <span className="font-mono text-slate-600">{m.material.numeroSerie}</span>
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
                    <button key={f.id} type="button" onClick={() => setFotoAmpliada(f.url)}>
                      <img src={f.url} alt="Evidencia" className="w-20 h-20 object-cover rounded-lg border border-slate-200" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {inc.tipo === "INSTALACION_NUEVA" && (inc.viabilidadEstado !== "VIABLE" || inc.viabilidadRespuesta) && (
          <div className="mt-4">
            <PanelViabilidad inc={inc} role={role} onActualizada={onActualizada} onAbrirFoto={setFotoAmpliada} />
          </div>
        )}
      </div>
    </div>
    <VisorFoto url={fotoAmpliada} onClose={() => setFotoAmpliada(null)} />
    </Fragment>
  );
}
