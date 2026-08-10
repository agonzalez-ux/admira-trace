"use client";

import { useEffect, useState } from "react";
import { TIPO_INCIDENCIA_LABELS, TIPOS_INCIDENCIA } from "@/lib/constants";

type Tecnico = { id: string; name: string; zona: string | null };

export default function IncidenciaCreateForm({ onCreated }: { onCreated: () => void }) {
  const [tecnicos, setTecnicos] = useState<Tecnico[]>([]);
  const [ticketExternoId, setTicketExternoId] = useState("");
  const [titulo, setTitulo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [tipo, setTipo] = useState<(typeof TIPOS_INCIDENCIA)[number]>("REPARACION");
  const [cliente, setCliente] = useState("");
  const [direccion, setDireccion] = useState("");
  const [tecnicoId, setTecnicoId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/tecnicos")
      .then((r) => r.json())
      .then((d) => setTecnicos(d.tecnicos || []));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setOk(false);
    if (!titulo || !tecnicoId) return setError("Título y técnico son obligatorios.");
    setSaving(true);
    const res = await fetch("/api/incidencias", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticketExternoId, titulo, descripcion, tipo, cliente, direccion, tecnicoId }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) return setError(data.error || "Error al crear la incidencia.");
    setOk(true);
    setTitulo("");
    setDescripcion("");
    setCliente("");
    setDireccion("");
    setTicketExternoId("");
    onCreated();
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 space-y-3">
      <h3 className="font-semibold text-slate-800">Asignar incidencia / ticket</h3>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">ID ticket del desk (opcional)</label>
          <input value={ticketExternoId} onChange={(e) => setTicketExternoId(e.target.value)} className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm" placeholder="DESK-10234" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Tipo</label>
          <select value={tipo} onChange={(e) => setTipo(e.target.value as any)} className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm">
            {TIPOS_INCIDENCIA.map((t) => (
              <option key={t} value={t}>{TIPO_INCIDENCIA_LABELS[t]}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Título</label>
        <input value={titulo} onChange={(e) => setTitulo(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Descripción</label>
        <textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} rows={2} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Cliente</label>
          <input value={cliente} onChange={(e) => setCliente(e.target.value)} className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Dirección</label>
          <input value={direccion} onChange={(e) => setDireccion(e.target.value)} className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm" />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Técnico asignado</label>
        <select value={tecnicoId} onChange={(e) => setTecnicoId(e.target.value)} className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm">
          <option value="">— Selecciona técnico —</option>
          {tecnicos.map((t) => (
            <option key={t.id} value={t.id}>{t.name}{t.zona ? ` · ${t.zona}` : ""}</option>
          ))}
        </select>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {ok && <p className="text-sm text-emerald-600">Incidencia asignada. El técnico verá la notificación en su app.</p>}
      <button disabled={saving} className="w-full bg-admira-600 hover:bg-admira-700 text-white font-medium rounded-lg py-2.5 disabled:opacity-60">
        {saving ? "Asignando…" : "Asignar incidencia"}
      </button>
    </form>
  );
}
