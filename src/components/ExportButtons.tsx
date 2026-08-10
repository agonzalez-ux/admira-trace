"use client";

import { useEffect, useState } from "react";

const TABLES: { key: string; label: string }[] = [
  { key: "all", label: "Todo (libro completo)" },
  { key: "materiales", label: "Material" },
  { key: "envios", label: "Envíos y recogidas" },
  { key: "incidencias", label: "Incidencias" },
  { key: "tecnicos", label: "Técnicos" },
];

type SheetsStatus = {
  configured: boolean;
  url: string | null;
  links: Record<string, string> | null;
  documentUrls: Record<string, string | null>;
  documentTitles: Record<string, string>;
};

// Los 5 documentos reales que ya usa el equipo, mapeados a la clave interna de cada pestaña.
const DOCUMENTOS_REALES: { key: string; nota?: string }[] = [
  { key: "materiales", nota: "Stock de material (pantallas, routers…)" },
  { key: "incidencias", nota: "Incidencias e intervenciones asignadas" },
  { key: "intervenciones", nota: "Log de intervenciones / llamadas" },
  { key: "censo", nota: "Censo de instalaciones nuevas" },
  { key: "estancos", nota: "Directorio maestro de estancos" },
];

export default function ExportButtons({
  tables = TABLES,
  documentos = DOCUMENTOS_REALES,
}: {
  tables?: { key: string; label: string }[];
  documentos?: { key: string; nota?: string }[];
}) {
  const [sheets, setSheets] = useState<SheetsStatus | null>(null);
  const [sincronizando, setSincronizando] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  function load() {
    fetch("/api/sheets/status")
      .then((r) => r.json())
      .then(setSheets)
      .catch(() => setSheets({ configured: false, url: null, links: null, documentUrls: {}, documentTitles: {} }));
  }

  useEffect(() => {
    load();
  }, []);

  async function sincronizarEstancos() {
    setSincronizando(true);
    setFeedback(null);
    const res = await fetch("/api/sheets/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ incluirEstancos: true }),
    });
    setSincronizando(false);
    if (!res.ok) {
      setFeedback("Error al sincronizar el directorio de estancos.");
      return;
    }
    setFeedback("Directorio de estancos sincronizado (13.598 registros).");
    load();
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
        <h3 className="font-semibold text-slate-800 mb-1">Documentos en vivo</h3>
        {sheets?.configured ? (
          <>
            <p className="text-xs text-slate-500 mb-3">
              Los mismos documentos que ya usáis, actualizados solos — sin descargar ni pedir el Excel a nadie.
            </p>
            <div className="grid gap-2">
              {documentos.map(({ key, nota }) => {
                const titulo = sheets.documentTitles?.[key] || key;
                const href = sheets.documentUrls?.[key];
                if (!href) {
                  return (
                    <div key={key} className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2.5 opacity-60">
                      <div>
                        <div className="text-sm font-medium text-slate-800">{titulo}</div>
                        <div className="text-[11px] text-slate-400">Todavía no se ha creado/compartido este Google Sheet</div>
                      </div>
                    </div>
                  );
                }
                return (
                  <a
                    key={key}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between bg-slate-50 hover:bg-slate-100 rounded-lg px-3 py-2.5 transition-colors"
                  >
                    <div>
                      <div className="text-sm font-medium text-slate-800">{titulo}</div>
                      {nota && <div className="text-[11px] text-slate-400">{nota}</div>}
                    </div>
                    <span className="text-[#0F9D58] text-xs font-medium">Abrir ↗</span>
                  </a>
                );
              })}
            </div>
            {documentos.some((d) => d.key === "estancos") && (
              <>
                <div className="flex items-center justify-between mt-3">
                  <button
                    onClick={sincronizarEstancos}
                    disabled={sincronizando}
                    className="text-xs font-medium bg-slate-700 hover:bg-slate-800 text-white rounded-lg px-3 py-2 disabled:opacity-60"
                  >
                    {sincronizando ? "Sincronizando ahora…" : "🔄 Forzar sincronización ahora"}
                  </button>
                  {feedback && <span className="text-xs text-emerald-600">{feedback}</span>}
                </div>
                <p className="text-[11px] text-slate-400 mt-2">
                  Se actualiza solo automáticamente (como mucho cada 20 minutos, al abrir Admira la app). Este botón
                  solo sirve para forzar una actualización inmediata sin esperar.
                </p>
              </>
            )}
          </>
        ) : sheets === null ? (
          <p className="text-xs text-slate-400">Comprobando conexión…</p>
        ) : (
          <p className="text-xs text-slate-400">
            Todavía no está conectado ningún Google Sheet. Mientras tanto, usa la exportación a Excel de abajo.
          </p>
        )}
      </div>

      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
        <h3 className="font-semibold text-slate-800 mb-3">Exportar a Excel (descarga puntual)</h3>
        <div className="flex flex-wrap gap-2">
          {tables.map((t) => (
            <a
              key={t.key}
              href={`/api/export?table=${t.key}`}
              className="text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-3 py-2"
            >
              📊 {t.label}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
