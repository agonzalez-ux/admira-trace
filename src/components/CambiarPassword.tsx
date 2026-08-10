"use client";

import { useState } from "react";

/**
 * Pantalla de cambio de contraseña. Se usa en dos modos:
 * - `obligatorio`: bloquea la app hasta que el usuario cambie la contraseña
 *   temporal (caso de los técnicos importados). No se puede cerrar.
 * - normal: modal opcional que se abre desde la barra superior.
 */
export default function CambiarPassword({
  obligatorio = false,
  onCerrar,
  onCambiada,
}: {
  obligatorio?: boolean;
  onCerrar?: () => void;
  onCambiada?: () => void;
}) {
  const [passwordActual, setPasswordActual] = useState("");
  const [passwordNueva, setPasswordNueva] = useState("");
  const [passwordConfirmacion, setPasswordConfirmacion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [guardando, setGuardando] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setGuardando(true);

    const res = await fetch("/api/auth/cambiar-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passwordActual, passwordNueva, passwordConfirmacion }),
    });
    const data = await res.json();
    setGuardando(false);

    if (!res.ok) {
      setError(data.error || "No se ha podido cambiar la contraseña.");
      return;
    }

    setOk(true);
    setPasswordActual("");
    setPasswordNueva("");
    setPasswordConfirmacion("");
    onCambiada?.();
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm p-5">
        <div className="flex items-start justify-between mb-1">
          <h2 className="font-bold text-lg text-slate-800">Cambiar contraseña</h2>
          {!obligatorio && (
            <button onClick={onCerrar} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">
              ×
            </button>
          )}
        </div>

        {obligatorio && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
            Estás usando una contraseña temporal. Por seguridad, cámbiala antes de continuar.
          </p>
        )}

        {ok ? (
          <div className="space-y-3">
            <p className="text-sm text-emerald-600">Contraseña actualizada correctamente.</p>
            <button
              onClick={() => (obligatorio ? window.location.reload() : onCerrar?.())}
              className="w-full bg-admira-600 hover:bg-admira-700 text-white font-medium rounded-lg py-2.5"
            >
              Continuar
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Contraseña actual</label>
              <input
                type="password"
                autoFocus
                value={passwordActual}
                onChange={(e) => setPasswordActual(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                placeholder="••••••••"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Nueva contraseña</label>
              <input
                type="password"
                value={passwordNueva}
                onChange={(e) => setPasswordNueva(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                placeholder="Mínimo 8 caracteres"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Repite la nueva contraseña</label>
              <input
                type="password"
                value={passwordConfirmacion}
                onChange={(e) => setPasswordConfirmacion(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                placeholder="••••••••"
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              disabled={guardando}
              className="w-full bg-admira-600 hover:bg-admira-700 text-white font-medium rounded-lg py-2.5 disabled:opacity-60"
            >
              {guardando ? "Guardando…" : "Cambiar contraseña"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
