"use client";

import { useState } from "react";
import { TIPOS_MATERIAL, TIPO_MATERIAL_LABELS, ESTADO_MATERIAL_LABELS } from "@/lib/constants";
import SerialNumberScanner from "@/components/SerialNumberScanner";

type Duplicado = {
  codigoBarras: string;
  tipo: string;
  tipoPersonalizado: string | null;
  nombre: string;
  estado: string;
  tecnico: string | null;
};

export default function MaterialCreateForm({
  onCreated,
  almacen = "FDM",
}: {
  onCreated: () => void;
  almacen?: "FDM" | "Admira";
}) {
  const [codigoBarras, setCodigoBarras] = useState("");
  const [tipo, setTipo] = useState<(typeof TIPOS_MATERIAL)[number]>("PANTALLA");
  const [tipoPersonalizado, setTipoPersonalizado] = useState("");
  const [nombre, setNombre] = useState("");
  const [numeroSerie, setNumeroSerie] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [saving, setSaving] = useState(false);

  // Aviso de que el formulario se ha rellenado solo tras escanear, para que la
  // persona sepa que debe repasarlo antes de guardar.
  const [autorrelleno, setAutorrelleno] = useState<string | null>(null);
  const [duplicado, setDuplicado] = useState<Duplicado | null>(null);
  const [consultando, setConsultando] = useState(false);

  /**
   * Al escanear (o al salir del campo del código) se consulta al servidor para
   * rellenar el resto del formulario y avisar si esa pieza ya estaba dada de alta.
   */
  async function rellenarDesdeCodigo(codigo: string) {
    const cod = codigo.trim();
    if (!cod) return;
    setConsultando(true);
    setError(null);
    setAutorrelleno(null);
    setDuplicado(null);

    try {
      const res = await fetch(`/api/materiales/sugerencia?codigoBarras=${encodeURIComponent(cod)}`);
      const data = await res.json();
      if (!res.ok) return;

      if (data.existe) {
        setDuplicado(data.material);
        return;
      }

      const s = data.sugerencia;
      const rellenados: string[] = [];

      if (s.tipo) {
        setTipo(s.tipo);
        rellenados.push("tipo");
      }
      if (s.nombre) {
        setNombre(s.nombre);
        rellenados.push("nombre");
      }
      if (s.descripcion) {
        setDescripcion(s.descripcion);
        rellenados.push("descripción");
      }

      if (rellenados.length > 0) {
        setAutorrelleno(
          `Se ha rellenado ${rellenados.join(", ")}${
            s.basadoEn ? ` a partir del último material igual (${s.basadoEn})` : ""
          }. Revísalo antes de guardar.`
        );
      }
    } finally {
      setConsultando(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setOk(false);
    if (!codigoBarras || !nombre) return setError("Código de barras y nombre son obligatorios.");
    if (tipo === "OTRO" && !tipoPersonalizado.trim()) return setError("Indica qué tipo de material es.");

    setSaving(true);
    const res = await fetch("/api/materiales", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ codigoBarras, tipo, tipoPersonalizado, nombre, descripcion, numeroSerie }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) return setError(data.error || "Error al dar de alta el material.");

    setOk(true);
    setCodigoBarras("");
    setNombre("");
    setNumeroSerie("");
    setDescripcion("");
    setTipoPersonalizado("");
    setAutorrelleno(null);
    setDuplicado(null);
    onCreated();
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 space-y-3">
      <h3 className="font-semibold text-slate-800">Dar de alta material en {almacen}</h3>

      <div className="flex gap-2">
        <input
          value={codigoBarras}
          onChange={(e) => setCodigoBarras(e.target.value)}
          onBlur={(e) => rellenarDesdeCodigo(e.target.value)}
          placeholder="Código de barras"
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={() => setScanning(true)}
          className="bg-admira-600 text-white rounded-lg px-3 py-2 text-sm"
          title="Escanear con la cámara"
        >
          📷
        </button>
      </div>

      {consultando && <p className="text-xs text-slate-400">Buscando datos de este código…</p>}

      {duplicado && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          <p className="text-xs font-medium text-red-800">Este material ya está dado de alta.</p>
          <p className="text-[11px] text-red-700 mt-0.5">
            {TIPO_MATERIAL_LABELS[duplicado.tipo as keyof typeof TIPO_MATERIAL_LABELS] || duplicado.tipo}
            {duplicado.tipoPersonalizado ? ` (${duplicado.tipoPersonalizado})` : ""} · {duplicado.nombre} ·{" "}
            {ESTADO_MATERIAL_LABELS[duplicado.estado as keyof typeof ESTADO_MATERIAL_LABELS] || duplicado.estado}
            {duplicado.tecnico ? ` · ${duplicado.tecnico}` : ""}
          </p>
        </div>
      )}

      {autorrelleno && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <p className="text-xs text-amber-800">✍️ {autorrelleno}</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <select
          value={tipo}
          onChange={(e) => setTipo(e.target.value as any)}
          className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm"
        >
          {TIPOS_MATERIAL.map((t) => (
            <option key={t} value={t}>
              {TIPO_MATERIAL_LABELS[t]}
            </option>
          ))}
        </select>
        <input
          value={numeroSerie}
          onChange={(e) => setNumeroSerie(e.target.value)}
          placeholder="Nº serie (opcional)"
          className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm"
        />
      </div>

      {tipo === "OTRO" && (
        <input
          value={tipoPersonalizado}
          onChange={(e) => setTipoPersonalizado(e.target.value)}
          placeholder="¿Qué tipo de material es? (p. ej. SIM, ventilador, regleta…)"
          className="w-full rounded-lg border border-admira-300 bg-admira-50 px-3 py-2 text-sm"
        />
      )}

      <input
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        placeholder="Nombre / modelo"
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
      />
      <textarea
        value={descripcion}
        onChange={(e) => setDescripcion(e.target.value)}
        placeholder="Descripción (opcional)"
        rows={2}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
      />

      {error && <p className="text-sm text-red-600">{error}</p>}
      {ok && <p className="text-sm text-emerald-600">Material dado de alta.</p>}

      <button
        disabled={saving || Boolean(duplicado)}
        className="w-full bg-admira-600 hover:bg-admira-700 text-white font-medium rounded-lg py-2.5 disabled:opacity-60"
      >
        {saving ? "Guardando…" : duplicado ? "Ya existe este código" : "Dar de alta"}
      </button>

      {scanning && (
        <SerialNumberScanner
          onScan={(numeroExtraido) => {
            setNumeroSerie(numeroExtraido);
            setScanning(false);
            // Si no hay código de barras, generar uno basado en el número de serie.
            // Al ponerlo, se consulta igual que si se hubiera escrito a mano, para
            // avisar de duplicados y autorrellenar tipo/nombre — si no, ese aviso
            // solo saltaba escribiendo el código manualmente.
            if (!codigoBarras && numeroExtraido) {
              const nuevoCodigo = numeroExtraido.replace(/\s/g, "").substring(0, 20);
              setCodigoBarras(nuevoCodigo);
              rellenarDesdeCodigo(nuevoCodigo);
            }
          }}
          onClose={() => setScanning(false)}
        />
      )}
    </form>
  );
}
