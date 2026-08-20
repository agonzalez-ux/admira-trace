"use client";

import { useEffect, useMemo, useState } from "react";
import { TIPO_MATERIAL_LABELS, TIPOS_MATERIAL, TRANSPORTISTAS, FRECUENCIAS_RECURRENTES } from "@/lib/constants";
import { TIPOS_MOVIMIENTO, type TipoMovimientoId } from "@/lib/envioLabel";
import TecnicoCombobox from "@/components/tecnicos/TecnicoCombobox";

type Tecnico = { id: string; name: string; zona: string | null };
type Material = { id: string; tipo: string };
type LineaOtro = { descripcion: string; cantidad: number };

// Categorías con cupo fijo (una fila cada una). "Otro" se gestiona aparte,
// como una lista de líneas propias, porque puede haber varias distintas en
// el mismo pedido (ej. "2 tablet" + "3 regleta").
const CATEGORIAS_FIJAS = TIPOS_MATERIAL.filter((t) => t !== "OTRO");

export default function EnvioCreateForm({ onCreated }: { onCreated: () => void }) {
  const [tecnicos, setTecnicos] = useState<Tecnico[]>([]);
  const [movimiento, setMovimiento] = useState<TipoMovimientoId>("ENVIO_FDM");
  const [tecnicoId, setTecnicoId] = useState("");
  const [transportista, setTransportista] = useState<(typeof TRANSPORTISTAS)[number]>("MARESA");
  // Pedido por categoría: cuántas unidades de cada tipo, no piezas concretas
  // — las piezas reales se enlazan una a una cuando el almacén las escanea al
  // preparar el envío.
  const [cantidades, setCantidades] = useState<Record<string, number>>({});
  // Líneas sueltas de material "Otro" — cada una con su propia descripción a
  // mano y cantidad, para poder pedir varias cosas distintas de golpe.
  const [otros, setOtros] = useState<LineaOtro[]>([]);
  const [esRecurrente, setEsRecurrente] = useState(false);
  const [frecuenciaDias, setFrecuenciaDias] = useState<number>(30);
  const [notas, setNotas] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Disponible en origen, solo como orientación (la comprobación real pasa al
  // escanear): almacén de origen si es Envío/Transferencia, o lo que tiene
  // encima el técnico si es Recogida.
  const [disponibles, setDisponibles] = useState<Record<string, number>>({});

  const config = TIPOS_MOVIMIENTO.find((m) => m.id === movimiento)!;

  useEffect(() => {
    fetch("/api/tecnicos")
      .then((r) => r.json())
      .then((d) => setTecnicos(d.tecnicos || []));
  }, []);

  useEffect(() => {
    setCantidades({});
    setOtros([]);
    setDisponibles({});
    setTecnicoId("");
  }, [movimiento]);

  useEffect(() => {
    async function cargarDisponibles() {
      let url: string | null = null;
      if (config.tipo === "RECOGIDA") {
        url = tecnicoId ? `/api/materiales?tecnicoId=${tecnicoId}&estado=EN_TECNICO` : null;
      } else {
        url = `/api/materiales?estado=${config.almacen === "ADMIRA" ? "EN_ADMIRA" : "EN_FDM"}`;
      }
      if (!url) {
        setDisponibles({});
        return;
      }
      const d = await fetch(url).then((r) => r.json());
      const conteo: Record<string, number> = {};
      for (const m of (d.materiales || []) as Material[]) conteo[m.tipo] = (conteo[m.tipo] || 0) + 1;
      setDisponibles(conteo);
    }
    cargarDisponibles();
  }, [config.tipo, config.almacen, tecnicoId]);

  // Líneas de "Otro" con cantidad puesta pero sin describir aún — hace falta
  // rellenarlas antes de poder enviar.
  const otrosSinDescribir = otros.filter((o) => o.cantidad > 0 && !o.descripcion.trim());

  const pedido = useMemo(() => {
    const fijos = CATEGORIAS_FIJAS.filter((t) => (cantidades[t] || 0) > 0).map((t) => ({
      tipo: t,
      cantidad: cantidades[t],
    }));
    const sueltos = otros
      .filter((o) => o.cantidad > 0 && o.descripcion.trim())
      .map((o) => ({ tipo: "OTRO", cantidad: o.cantidad, descripcion: o.descripcion.trim() }));
    return [...fijos, ...sueltos];
  }, [cantidades, otros]);

  function añadirLineaOtro() {
    setOtros((prev) => [...prev, { descripcion: "", cantidad: 1 }]);
  }
  function actualizarLineaOtro(idx: number, cambios: Partial<LineaOtro>) {
    setOtros((prev) => prev.map((o, i) => (i === idx ? { ...o, ...cambios } : o)));
  }
  function quitarLineaOtro(idx: number) {
    setOtros((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setOk(null);
    if (config.requiereTecnico && !tecnicoId) return setError("Selecciona un técnico.");
    if (otrosSinDescribir.length > 0) {
      return setError('Indica a mano qué material es exactamente en cada línea de "Otro" (o quítala si no hace falta).');
    }
    if (pedido.length === 0) return setError("Indica al menos una categoría de material con cantidad.");
    setSaving(true);

    const res = await fetch("/api/envios", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tipo: config.tipo,
        almacen: config.almacen,
        transportista,
        tecnicoId: config.requiereTecnico ? tecnicoId : undefined,
        pedido,
        esRecurrente: config.tipo === "ENVIO" ? esRecurrente : false,
        frecuenciaDias: esRecurrente ? frecuenciaDias : undefined,
        notas,
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(data.error || "Error al crear el movimiento.");
      return;
    }

    setOk(
      data.ordenRecurrente
        ? `Movimiento creado y orden recurrente configurada (cada ${frecuenciaDias} días). El próximo se generará solo.`
        : "Movimiento creado correctamente."
    );
    setCantidades({});
    setOtros([]);
    setNotas("");
    onCreated();
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 space-y-3">
      <h3 className="font-semibold text-slate-800">Nuevo envío / recogida / transferencia</h3>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Tipo de movimiento</label>
          <select
            value={movimiento}
            onChange={(e) => setMovimiento(e.target.value as TipoMovimientoId)}
            className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm"
          >
            {TIPOS_MOVIMIENTO.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Transportista</label>
          <select value={transportista} onChange={(e) => setTransportista(e.target.value as any)} className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm">
            {TRANSPORTISTAS.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
      </div>

      {config.requiereTecnico && (
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Técnico</label>
          <TecnicoCombobox
            tecnicos={tecnicos}
            value={tecnicoId}
            onChange={setTecnicoId}
            placeholder="Buscar técnico por nombre o ciudad…"
            className="text-sm"
          />
        </div>
      )}

      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">
          ¿Cuánto material, de cada tipo?
        </label>
        <p className="text-[11px] text-slate-400 mb-2">
          No hace falta elegir piezas concretas — el almacén escaneará los números de serie reales al preparar el
          envío, y así queda registrado qué unidad exacta se manda.
        </p>
        <div className="grid grid-cols-2 gap-2">
          {CATEGORIAS_FIJAS.map((t) => (
            <div key={t} className="flex items-center justify-between gap-2 bg-slate-50 rounded-lg px-2 py-1.5">
              <label className="text-xs text-slate-600 min-w-0 truncate" title={TIPO_MATERIAL_LABELS[t]}>
                {TIPO_MATERIAL_LABELS[t]}
                {disponibles[t] != null && (
                  <span className="text-slate-400"> ({disponibles[t]} disp.)</span>
                )}
              </label>
              <input
                type="number"
                min={0}
                value={cantidades[t] || ""}
                onChange={(e) =>
                  setCantidades((c) => ({ ...c, [t]: Math.max(0, Number(e.target.value) || 0) }))
                }
                placeholder="0"
                className="w-16 rounded-lg border border-slate-300 px-2 py-1 text-sm text-right shrink-0"
              />
            </div>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Otro material (opcional)</label>
        <p className="text-[11px] text-slate-400 mb-2">
          Puedes añadir varias líneas distintas (ej. "2 tablet" y "3 regleta") si en este movimiento hace falta más
          de una cosa que no encaje en las categorías de arriba.
        </p>
        <div className="space-y-2">
          {otros.map((o, idx) => (
            <div key={idx} className="flex gap-2">
              <input
                value={o.descripcion}
                onChange={(e) => actualizarLineaOtro(idx, { descripcion: e.target.value })}
                placeholder='¿Qué es exactamente? (ej. "tablet", "regleta"...)'
                className="flex-1 rounded-lg border border-admira-300 bg-admira-50 px-3 py-2 text-sm"
                autoFocus
              />
              <input
                type="number"
                min={1}
                value={o.cantidad}
                onChange={(e) => actualizarLineaOtro(idx, { cantidad: Math.max(1, Number(e.target.value) || 1) })}
                className="w-16 rounded-lg border border-admira-300 bg-admira-50 px-2 py-2 text-sm text-right shrink-0"
              />
              <button
                type="button"
                onClick={() => quitarLineaOtro(idx)}
                className="text-slate-400 hover:text-red-600 px-1 shrink-0"
                title="Quitar esta línea"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={añadirLineaOtro}
          className="mt-2 text-xs font-medium text-admira-600 hover:underline"
        >
          + Añadir otro material
        </button>
      </div>

      {config.tipo === "ENVIO" && (
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={esRecurrente} onChange={(e) => setEsRecurrente(e.target.checked)} />
          Envío recurrente (técnico lejano / alta demanda)
        </label>
      )}

      {esRecurrente && config.tipo === "ENVIO" && (
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
          <label className="block text-xs font-medium text-purple-900 mb-1">¿Cada cuánto se repite el envío?</label>
          <select
            value={frecuenciaDias}
            onChange={(e) => setFrecuenciaDias(Number(e.target.value))}
            className="w-full rounded-lg border border-purple-300 px-2 py-2 text-sm"
          >
            {FRECUENCIAS_RECURRENTES.map((f) => (
              <option key={f.dias} value={f.dias}>{f.label} ({f.dias} días)</option>
            ))}
          </select>
          <p className="text-[11px] text-purple-700 mt-1">
            Se creará una orden automática: cada {frecuenciaDias} días se generará un envío con el mismo pedido por
            categorías. Podrás editarla o eliminarla desde la ficha del técnico.
          </p>
        </div>
      )}

      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Notas</label>
        <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {ok && <p className="text-sm text-emerald-600">{ok}</p>}
      <button disabled={saving} className="w-full bg-admira-600 hover:bg-admira-700 text-white font-medium rounded-lg py-2.5 disabled:opacity-60">
        {saving ? "Creando…" : "Crear movimiento"}
      </button>
    </form>
  );
}
