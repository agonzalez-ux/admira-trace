"use client";

import { useEffect, useMemo, useState } from "react";
import { TIPO_MATERIAL_LABELS, TRANSPORTISTAS, FRECUENCIAS_RECURRENTES } from "@/lib/constants";

type Tecnico = { id: string; name: string; zona: string | null };
type Material = { id: string; numeroSerie: string; tipo: string; nombre: string; estado: string; tecnicoId: string | null };

export default function EnvioCreateForm({ onCreated }: { onCreated: () => void }) {
  const [tecnicos, setTecnicos] = useState<Tecnico[]>([]);
  const [materiales, setMateriales] = useState<Material[]>([]);
  const [tipo, setTipo] = useState<"ENVIO" | "RECOGIDA">("ENVIO");
  const [tecnicoId, setTecnicoId] = useState("");
  const [transportista, setTransportista] = useState<(typeof TRANSPORTISTAS)[number]>("MARESA");
  const [selected, setSelected] = useState<string[]>([]);
  const [esRecurrente, setEsRecurrente] = useState(false);
  const [frecuenciaDias, setFrecuenciaDias] = useState<number>(30);
  const [notas, setNotas] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Filtros del selector de material (la lista real es muy larga).
  const [busqueda, setBusqueda] = useState("");
  const [categoriaAbierta, setCategoriaAbierta] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/tecnicos")
      .then((r) => r.json())
      .then((d) => setTecnicos(d.tecnicos || []));
  }, []);

  useEffect(() => {
    setSelected([]);
    setBusqueda("");
    setCategoriaAbierta(null);

    if (tipo === "ENVIO") {
      // El material a enviar puede estar en el almacén de FDM o en el de Admira.
      Promise.all([
        fetch("/api/materiales?estado=EN_FDM").then((r) => r.json()),
        fetch("/api/materiales?estado=EN_ADMIRA").then((r) => r.json()),
      ]).then(([fdm, admira]) => {
        setMateriales([...(fdm.materiales || []), ...(admira.materiales || [])]);
      });
      return;
    }

    if (!tecnicoId) {
      setMateriales([]);
      return;
    }
    fetch(`/api/materiales?tecnicoId=${tecnicoId}&estado=EN_TECNICO`)
      .then((r) => r.json())
      .then((d) => setMateriales(d.materiales || []));
  }, [tipo, tecnicoId]);

  const origen = tipo === "ENVIO" ? "Almacén FDM / Admira" : tecnicos.find((t) => t.id === tecnicoId)?.name || "";
  const destino = tipo === "ENVIO" ? tecnicos.find((t) => t.id === tecnicoId)?.name || "" : "Almacén FDM / Admira";

  // Material agrupado por categoría, aplicando el buscador.
  const porCategoria = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const filtrados = q
      ? materiales.filter((m) => m.nombre.toLowerCase().includes(q) || m.numeroSerie.toLowerCase().includes(q))
      : materiales;

    const map = new Map<string, Material[]>();
    for (const m of filtrados) {
      const lista = map.get(m.tipo);
      if (lista) lista.push(m);
      else map.set(m.tipo, [m]);
    }
    return Array.from(map.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [materiales, busqueda]);

  function toggle(id: string) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  function toggleCategoriaCompleta(items: Material[]) {
    const ids = items.map((m) => m.id);
    const todosSeleccionados = ids.every((id) => selected.includes(id));
    setSelected((s) => (todosSeleccionados ? s.filter((id) => !ids.includes(id)) : Array.from(new Set([...s, ...ids]))));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setOk(null);
    if (!tecnicoId) return setError("Selecciona un técnico.");
    if (selected.length === 0) return setError("Selecciona al menos un material.");
    setSaving(true);

    const res = await fetch("/api/envios", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tipo,
        transportista,
        origen,
        destino,
        tecnicoId,
        materialIds: selected,
        esRecurrente,
        frecuenciaDias: esRecurrente ? frecuenciaDias : undefined,
        notas,
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(data.error || "Error al crear el envío.");
      return;
    }

    setOk(
      data.ordenRecurrente
        ? `Envío creado y orden recurrente configurada (cada ${frecuenciaDias} días). El próximo se generará solo.`
        : "Envío creado correctamente."
    );
    setSelected([]);
    setNotas("");
    onCreated();
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 space-y-3">
      <h3 className="font-semibold text-slate-800">Nuevo envío / recogida</h3>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Tipo de movimiento</label>
          <select value={tipo} onChange={(e) => setTipo(e.target.value as any)} className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm">
            <option value="ENVIO">Envío (Almacén → Técnico)</option>
            <option value="RECOGIDA">Recogida (Técnico → Almacén)</option>
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
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Técnico</label>
        <select value={tecnicoId} onChange={(e) => setTecnicoId(e.target.value)} className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm">
          <option value="">— Selecciona técnico —</option>
          {tecnicos.map((t) => (
            <option key={t.id} value={t.id}>{t.name}{t.zona ? ` · ${t.zona}` : ""}</option>
          ))}
        </select>
      </div>
      {tecnicoId && <div className="text-xs text-slate-500">{origen} → {destino}</div>}

      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">
          Material disponible {tipo === "ENVIO" ? "en almacén" : "en el técnico"}
          {selected.length > 0 && <span className="text-admira-600"> · {selected.length} seleccionado(s)</span>}
        </label>
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre o número de serie…"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm mb-2"
        />
        <div className="max-h-72 overflow-y-auto border border-slate-200 rounded-lg divide-y">
          {porCategoria.length === 0 && (
            <div className="text-xs text-slate-400 p-3">
              {materiales.length === 0 ? "No hay material disponible." : "Ningún material coincide con la búsqueda."}
            </div>
          )}
          {porCategoria.map(([categoria, items]) => {
            const abierta = categoriaAbierta === categoria || Boolean(busqueda.trim());
            const seleccionadosEnCat = items.filter((m) => selected.includes(m.id)).length;
            return (
              <div key={categoria}>
                <button
                  type="button"
                  onClick={() => setCategoriaAbierta(abierta && !busqueda.trim() ? null : categoria)}
                  className="w-full flex items-center justify-between px-3 py-2 bg-slate-50 hover:bg-slate-100 text-left"
                >
                  <span className="text-sm font-medium text-slate-700">
                    {abierta ? "▾" : "▸"} {TIPO_MATERIAL_LABELS[categoria as keyof typeof TIPO_MATERIAL_LABELS] || categoria}
                    <span className="text-xs font-normal text-slate-400"> · {items.length} disponibles</span>
                  </span>
                  {seleccionadosEnCat > 0 && (
                    <span className="text-[11px] bg-admira-600 text-white rounded-full px-2 py-0.5">{seleccionadosEnCat}</span>
                  )}
                </button>
                {abierta && (
                  <div className="divide-y">
                    <button
                      type="button"
                      onClick={() => toggleCategoriaCompleta(items)}
                      className="w-full text-left px-3 py-1.5 text-[11px] text-admira-600 hover:bg-slate-50"
                    >
                      {items.every((m) => selected.includes(m.id)) ? "Quitar todos de esta categoría" : "Seleccionar todos de esta categoría"}
                    </button>
                    {items.map((m) => (
                      <label key={m.id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-slate-50">
                        <input type="checkbox" checked={selected.includes(m.id)} onChange={() => toggle(m.id)} />
                        <span className="font-mono text-xs text-slate-500">{m.numeroSerie}</span>
                        <span className="truncate">{m.nombre}</span>
                        {m.estado === "EN_ADMIRA" && (
                          <span className="text-[10px] bg-admira-100 text-admira-700 rounded-full px-1.5 shrink-0">Admira</span>
                        )}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-600">
        <input type="checkbox" checked={esRecurrente} onChange={(e) => setEsRecurrente(e.target.checked)} />
        Envío recurrente (técnico lejano / alta demanda)
      </label>

      {esRecurrente && (
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
            Se creará una orden automática: cada {frecuenciaDias} días se generará un envío con los mismos tipos y
            cantidades de material. Podrás editarla o eliminarla desde la ficha del técnico.
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
        {saving ? "Creando…" : "Crear envío"}
      </button>
    </form>
  );
}
