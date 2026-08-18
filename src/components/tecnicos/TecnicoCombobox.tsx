"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type OpcionTecnico = {
  id: string;
  name: string;
  zona: string | null;
  distanciaKm?: number | null;
  destacar?: boolean;
};

// Para que buscar "jaen" encuentre "Jaén", "malaga" encuentre "Málaga", etc. —
// mucha gente no escribe tildes al buscar.
function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function etiqueta(t: OpcionTecnico): string {
  return `${t.destacar ? "⭐ " : ""}${t.name}${t.zona ? ` · ${t.zona}` : ""}${
    t.distanciaKm != null ? ` — ${t.distanciaKm} km` : ""
  }`;
}

/**
 * Selector de técnico con búsqueda: en vez de un <select> plano (incómodo con
 * 200+ técnicos), es un campo de texto que se puede escribir para filtrar por
 * nombre o ciudad/zona, con un desplegable de resultados debajo.
 */
export default function TecnicoCombobox({
  tecnicos,
  value,
  onChange,
  placeholder = "Buscar técnico por nombre o ciudad…",
  className = "",
}: {
  tecnicos: OpcionTecnico[];
  value: string;
  onChange: (tecnicoId: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const contenedorRef = useRef<HTMLDivElement>(null);

  const seleccionado = tecnicos.find((t) => t.id === value) || null;

  const filtrados = useMemo(() => {
    const q = normalizar(query.trim());
    if (!q) return tecnicos;
    return tecnicos.filter(
      (t) => normalizar(t.name).includes(q) || normalizar(t.zona || "").includes(q)
    );
  }, [tecnicos, query]);

  useEffect(() => {
    if (!open) return;
    function alClicarFuera(e: MouseEvent) {
      if (contenedorRef.current && !contenedorRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", alClicarFuera);
    return () => document.removeEventListener("mousedown", alClicarFuera);
  }, [open]);

  function elegir(tecnicoId: string) {
    onChange(tecnicoId);
    setOpen(false);
    setQuery("");
  }

  return (
    <div ref={contenedorRef} className="relative">
      <input
        type="text"
        value={open ? query : seleccionado ? etiqueta(seleccionado) : ""}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={(e) => {
          setOpen(true);
          setQuery("");
          e.target.select();
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setOpen(false);
            setQuery("");
            (e.target as HTMLInputElement).blur();
          } else if (e.key === "Enter" && filtrados.length > 0) {
            e.preventDefault();
            elegir(filtrados[0].id);
          }
        }}
        placeholder={seleccionado && !open ? undefined : placeholder}
        className={`w-full rounded-lg border border-slate-300 px-2 py-2 ${className || "text-xs"}`}
      />
      {open && (
        <div className="absolute z-20 mt-1 w-full max-h-48 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-lg">
          {filtrados.length === 0 ? (
            <p className="text-xs text-slate-400 px-2 py-2">No hay técnicos que coincidan.</p>
          ) : (
            filtrados.map((t) => (
              <button
                key={t.id}
                type="button"
                onMouseDown={(e) => {
                  // onMouseDown (no onClick) para que dispare antes del blur del input.
                  e.preventDefault();
                  elegir(t.id);
                }}
                className={`w-full text-left text-xs px-2 py-1.5 hover:bg-admira-50 ${
                  t.id === value ? "bg-admira-50 font-medium" : ""
                }`}
              >
                {etiqueta(t)}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
