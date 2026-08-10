"use client";

import { useState } from "react";

/** Formulario de "he olvidado mi contraseña": pide el email y envía el enlace. */
export default function RecuperarPassword({ onCerrar }: { onCerrar: () => void }) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setEnviando(true);

    const res = await fetch("/api/auth/recuperar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = await res.json();
    setEnviando(false);

    if (!res.ok) {
      setError(data.error || "No se ha podido enviar el email.");
      return;
    }
    setMensaje(data.mensaje);
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm p-5">
        <div className="flex items-start justify-between mb-1">
          <h2 className="font-bold text-lg text-slate-800">Recuperar contraseña</h2>
          <button onClick={onCerrar} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">
            ×
          </button>
        </div>

        {mensaje ? (
          <div className="space-y-3">
            <p className="text-sm text-emerald-600">{mensaje}</p>
            <p className="text-xs text-slate-400">
              Revisa también la carpeta de spam. El enlace caduca en 1 hora.
            </p>
            <button
              onClick={onCerrar}
              className="w-full bg-admira-600 hover:bg-admira-700 text-white font-medium rounded-lg py-2.5"
            >
              Entendido
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <p className="text-xs text-slate-500">
              Introduce el email de tu cuenta y te enviaremos un enlace para elegir una contraseña nueva.
            </p>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Email</label>
              <input
                type="email"
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                placeholder="tu@empresa.com"
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              disabled={enviando}
              className="w-full bg-admira-600 hover:bg-admira-700 text-white font-medium rounded-lg py-2.5 disabled:opacity-60"
            >
              {enviando ? "Enviando…" : "Enviar enlace"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
