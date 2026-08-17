"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import CambiarPassword from "./CambiarPassword";
import NotificationBell from "./NotificationBell";

export default function TopBar({
  title,
  subtitle,
  roleColor = "bg-admira-600",
}: {
  title: string;
  subtitle?: string;
  roleColor?: string;
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
