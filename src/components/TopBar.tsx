"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import CambiarPassword from "./CambiarPassword";
import NotificationBell from "./NotificationBell";
import { useProyecto } from "@/lib/proyectoContext";
import { PROYECTOS, PROYECTO_LABELS, Proyecto } from "@/lib/constants";

function SelectorProyecto() {
  const { proyecto, setProyecto } = useProyecto();
  return (
    <select
      value={proyecto}
      onChange={(e) => setProyecto(e.target.value as Proyecto)}
      className="max-w-[7rem] sm:max-w-none text-sm bg-white/15 hover:bg-white/25 rounded-lg px-2 py-1.5 transition-colors text-white [&>option]:text-slate-800"
      title="Cambiar de proyecto — filtra incidencias, material y técnicos"
    >
      {PROYECTOS.map((p) => (
        <option key={p} value={p}>
          {PROYECTO_LABELS[p]}
        </option>
      ))}
    </select>
  );
}

export default function TopBar({
  title,
  subtitle,
  roleColor = "bg-admira-600",
  mostrarSelectorProyecto = false,
}: {
  title: string;
  subtitle?: string;
  roleColor?: string;
  mostrarSelectorProyecto?: boolean;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [debeCambiar, setDebeCambiar] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setDebeCambiar(Boolean(d?.user?.debeCambiarPassword)))
      .catch(() => setDebeCambiar(false));
  }, []);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  return (
    <>
      <div className={`${roleColor} text-white px-4 py-3 flex items-center justify-between gap-2 shadow-md sticky top-0 z-20`}>
        <div className="min-w-0">
          <div className="font-bold text-lg leading-tight truncate">{title}</div>
          {subtitle && <div className="text-xs text-white/80 truncate">{subtitle}</div>}
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {mostrarSelectorProyecto && <SelectorProyecto />}
          <NotificationBell />
          <button
            onClick={() => setAbierto(true)}
            className="text-sm bg-white/15 hover:bg-white/25 rounded-lg px-2 sm:px-3 py-1.5 transition-colors"
            title="Cambiar contraseña"
          >
            🔑
          </button>
          <button
            onClick={logout}
            className="text-sm bg-white/15 hover:bg-white/25 rounded-lg px-2 sm:px-3 py-1.5 transition-colors"
            title="Cerrar sesión"
          >
            <span className="sm:hidden">🚪</span>
            <span className="hidden sm:inline">Cerrar sesión</span>
          </button>
        </div>
      </div>

      {/* Si la contraseña es temporal, el cambio es obligatorio y no se puede cerrar. */}
      {(debeCambiar || abierto) && (
        <CambiarPassword
          obligatorio={debeCambiar}
          onCerrar={() => setAbierto(false)}
          onCambiada={() => setDebeCambiar(false)}
        />
      )}
    </>
  );
}
