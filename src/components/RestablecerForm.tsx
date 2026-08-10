"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function RestablecerForm({ token }: { token: string }) {
  const router = useRouter();
  const [estado, setEstado] = useState<"comprobando" | "valido" | "invalido" | "hecho">("comprobando");
  const [nombre, setNombre] = useState("");
  const [usuario, setUsuario] = useState("");
  const [passwordNueva, setPasswordNueva] = useState("");
  const [passwordConfirmacion, setPasswordConfirmacion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!token) {
      setEstado("invalido");
      setError("Falta el enlace de restablecimiento.");
      return;
    }
    fetch(`/api/auth/restablecer?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.valido) {
          setNombre(d.nombre || "");
          setUsuario(d.usuario || "");
          setEstado("valido");
        } else {
          setEstado("invalido");
          setError(d.error || "El enlace no es válido o ha caducado.");
        }
      })
      .catch(() => {
        setEstado("invalido");
        setError("No se ha podido comprobar el enlace.");
      });
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setGuardando(true);
    const res = await fetch("/api/auth/restablecer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, passwordNueva, passwordConfirmacion }),
    });
    const data = await res.json();
    setGuardando(false);
    if (!res.ok) {
      setError(data.error || "No se ha podido restablecer la contraseña.");
      return;
    }
    setEstado("hecho");
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-admira-900 to-admira-700 px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-lg p-6">
        <h1 className="font-bold text-lg text-slate-800 mb-1">Restablecer contraseña</h1>

        {estado === "comprobando" && <p className="text-sm text-slate-400">Comprobando el enlace…</p>}

        {estado === "invalido" && (
          <>
            <p className="text-sm text-red-600 mb-4">{error}</p>
            <button
              onClick={() => router.push("/")}
              className="w-full bg-admira-600 hover:bg-admira-700 text-white font-medium rounded-lg py-2.5"
            >
              Volver al inicio de sesión
            </button>
          </>
        )}

        {estado === "hecho" && (
          <>
            <p className="text-sm text-emerald-600 mb-4">
              Contraseña actualizada. Ya puedes entrar con la nueva.
            </p>
            <button
              onClick={() => router.push("/")}
              className="w-full bg-admira-600 hover:bg-admira-700 text-white font-medium rounded-lg py-2.5"
            >
              Ir al inicio de sesión
            </button>
          </>
        )}

        {estado === "valido" && (
          <form onSubmit={handleSubmit} className="space-y-3">
            <p className="text-xs text-slate-500">
              {nombre} — usuario <span className="font-mono">{usuario}</span>
            </p>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Nueva contraseña</label>
              <input
                type="password"
                autoFocus
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
              {guardando ? "Guardando…" : "Guardar contraseña"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
