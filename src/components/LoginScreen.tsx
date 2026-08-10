"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ROLE_LABELS, Rol } from "@/lib/constants";
import RecuperarPassword from "./RecuperarPassword";

const ROLE_INFO: Record<Rol, { title: string; desc: string; icon: string }> = {
  TECNICO: {
    title: "Técnico",
    desc: "Consulta tu material, recibe envíos e incidencias",
    icon: "🔧",
  },
  ADMIRA: {
    title: "Admira",
    desc: "Gestión de material, envíos e incidencias",
    icon: "🗂️",
  },
  FDM: {
    title: "FDM",
    desc: "Almacén y preparación de envíos",
    icon: "📦",
  },
};

export default function LoginScreen() {
  const router = useRouter();
  const [role, setRole] = useState<Rol | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [recuperando, setRecuperando] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!role) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, username, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Error al iniciar sesión.");
        setLoading(false);
        return;
      }
      router.push(`/${role.toLowerCase()}`);
      router.refresh();
    } catch {
      setError("No se ha podido conectar con el servidor.");
      setLoading(false);
    }
  }

  if (!role) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-admira-900 to-admira-700 px-4">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold text-white tracking-tight">Admira Trace</h1>
          <p className="text-admira-100 mt-2">Gestión de instalaciones e inventario · Altadis</p>
        </div>
        <div className="grid gap-4 w-full max-w-sm">
          {(Object.keys(ROLE_INFO) as Rol[]).map((r) => (
            <button
              key={r}
              onClick={() => setRole(r)}
              className="w-full bg-white rounded-2xl p-5 shadow-lg flex items-center gap-4 hover:scale-[1.02] transition-transform text-left"
            >
              <span className="text-3xl">{ROLE_INFO[r].icon}</span>
              <div>
                <div className="font-semibold text-slate-900">{ROLE_INFO[r].title}</div>
                <div className="text-sm text-slate-500">{ROLE_INFO[r].desc}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-admira-900 to-admira-700 px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-lg p-6">
        <button
          onClick={() => setRole(null)}
          className="text-sm text-admira-600 mb-4 flex items-center gap-1"
        >
          ← Cambiar acceso
        </button>
        <div className="flex items-center gap-3 mb-6">
          <span className="text-3xl">{ROLE_INFO[role].icon}</span>
          <div>
            <div className="font-semibold text-lg">{ROLE_LABELS[role]}</div>
            <div className="text-xs text-slate-500">Inicia sesión para continuar</div>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Usuario</label>
            <input
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-admira-500"
              placeholder={role === "TECNICO" ? "tecnico" : role === "ADMIRA" ? "admira" : "fdm"}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Contraseña</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-admira-500"
              placeholder="••••••••"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-admira-600 hover:bg-admira-700 text-white font-medium rounded-lg py-2.5 transition-colors disabled:opacity-60"
          >
            {loading ? "Entrando..." : "Iniciar sesión"}
          </button>
        </form>
        <button
          onClick={() => setRecuperando(true)}
          className="w-full text-xs text-admira-600 hover:underline mt-3"
        >
          He olvidado mi contraseña
        </button>
        {recuperando && <RecuperarPassword onCerrar={() => setRecuperando(false)} />}
      </div>
    </div>
  );
}
