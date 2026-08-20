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
      className="text-sm bg-white/15 hover:bg-white/25 rounded-lg px-2 py-1.5 transition-colors text-white [&>option]:text-slate-800"
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
      <div className={`${roleColor} text-white px-4 py-4 flex items-center justify-between shadow-md sticky top-0 z-20`}>
        <div>
          <div className="font-bold text-lg leading-tight">{title}</div>
          {subtitle && <div className="text-xs text-white/80">{subtitle}</div>}
        </div>
        <div className="flex items-center gap-2">
          {mostrarSelectorProyecto && <SelectorProyecto />}
          <NotificationBell />
          <button
            onClick={() => setAbierto(true)}
            className="text-sm bg-white/15 hover:bg-white/25 rounded-lg px-3 py-1.5 transition-colors"
            title="Cambiar contraseña"
          >
            🔑
          </button>
          <button
            onClick={logout}
            className="text-sm bg-white/15 hover:bg-white/25 rounded-lg px-3 py-1.5 transition-colors"
          >
            Cerrar sesión
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
