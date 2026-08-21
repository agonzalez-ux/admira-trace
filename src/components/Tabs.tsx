"use client";

import { useEffect, useState } from "react";

export default function Tabs({
  tabs,
}: {
  tabs: { key: string; label: string; content: React.ReactNode }[];
}) {
  const [active, setActive] = useState(tabs[0]?.key);

  // La lista de pestañas puede cambiar en caliente (ej. al cambiar de
  // proyecto, "Material"/"Instalaciones" aparecen o desaparecen) — si la
  // pestaña activa deja de existir, se cae a la primera disponible en vez de
  // quedarse mostrando nada.
  useEffect(() => {
    if (!tabs.some((t) => t.key === active)) {
      setActive(tabs[0]?.key);
    }
  });

  return (
    <div>
      <div className="flex gap-1 overflow-x-auto px-4 pt-3 pb-1 bg-white border-b border-slate-100 sticky top-[64px] z-10">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActive(t.key)}
            className={`whitespace-nowrap text-sm font-medium rounded-t-lg px-3 py-2 transition-colors ${
              active === t.key ? "bg-admira-50 text-admira-700 border-b-2 border-admira-600" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="p-4">{tabs.find((t) => t.key === active)?.content}</div>
    </div>
  );
}
