"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Notificacion = {
  id: string;
  tipo: string;
  titulo: string;
  mensaje: string;
  leida: boolean;
  createdAt: string;
};

const POLL_MS = 20_000;

/** Convierte la clave pública VAPID (base64url) al formato que pide PushManager.subscribe(). */
function urlBase64ToUint8Array(base64Url: string): Uint8Array {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

function tiempoRelativo(iso: string): string {
  const segundos = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (segundos < 60) return "ahora mismo";
  const minutos = Math.floor(segundos / 60);
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;
  const dias = Math.floor(horas / 24);
  return `hace ${dias} d`;
}

export default function NotificationBell() {
  const [notificaciones, setNotificaciones] = useState<Notificacion[]>([]);
  const [noLeidas, setNoLeidas] = useState(0);
  const [abierto, setAbierto] = useState(false);
  const [pushActivo, setPushActivo] = useState<boolean | null>(null); // null = aún no lo sabemos
  const [activandoPush, setActivandoPush] = useState(false);
  const [errorPush, setErrorPush] = useState<string | null>(null);
  const contenedorRef = useRef<HTMLDivElement>(null);

  // En iPhone/iPad, Safari solo permite pedir permiso de notificaciones a la
  // app ya instalada en la pantalla de inicio (modo standalone) — en una
  // pestaña normal ni siquiera existe `Notification`/`PushManager`, así que
  // hay que explicarlo en vez de dejar que el botón falle en silencio.
  const esIOS =
    typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent) && !("MSStream" in window);
  const esStandalone =
    typeof window !== "undefined" &&
    (window.matchMedia?.("(display-mode: standalone)").matches || (navigator as any).standalone === true);

  const cargar = useCallback(async () => {
    try {
      const res = await fetch("/api/notificaciones");
      if (!res.ok) return;
      const data = await res.json();
      setNotificaciones(data.notificaciones || []);
      setNoLeidas(data.noLeidas || 0);
    } catch {
      // Si falla el polling, se reintenta en el siguiente ciclo sin más.
    }
  }, []);

  useEffect(() => {
    cargar();
    const intervalo = setInterval(cargar, POLL_MS);
    return () => clearInterval(intervalo);
  }, [cargar]);

  // Comprueba si ya hay una suscripción push activa en este dispositivo.
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setPushActivo(false);
      return;
    }
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setPushActivo(Boolean(sub)))
      .catch(() => setPushActivo(false));
  }, []);

  useEffect(() => {
    function onClickFuera(e: MouseEvent) {
      if (contenedorRef.current && !contenedorRef.current.contains(e.target as Node)) {
        setAbierto(false);
      }
    }
    document.addEventListener("mousedown", onClickFuera);
    return () => document.removeEventListener("mousedown", onClickFuera);
  }, []);

  async function activarPush() {
    const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidKey) return;
    setErrorPush(null);

    if (esIOS && !esStandalone) {
      // Diagnóstico temporal: esto no debería pasar si ya se ha abierto desde
      // el icono de la pantalla de inicio — lo mostramos para saber por qué
      // iOS no lo está reconociendo como "instalada" en este caso concreto.
      const diag = `standalone(CSS)=${window.matchMedia?.("(display-mode: standalone)").matches} · navigator.standalone=${(navigator as any).standalone} · UA=${navigator.userAgent.slice(0, 60)}`;
      setErrorPush(
        `En iPhone/iPad, primero añade Admira Trace a la pantalla de inicio: toca "Compartir" y luego "Añadir a pantalla de inicio", y ábrela desde ahí para poder activar las notificaciones.\n\n[diagnóstico: ${diag}]`
      );
      return;
    }
    if (typeof Notification === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      setErrorPush("Este navegador no admite notificaciones push.");
      return;
    }

    setActivandoPush(true);
    try {
      const permiso = await Notification.requestPermission();
      if (permiso !== "granted") {
        setErrorPush(
          permiso === "denied"
            ? "Las notificaciones están bloqueadas para esta app — actívalas desde los ajustes del navegador."
            : null
        );
        setActivandoPush(false);
        return;
      }
      const registro = await navigator.serviceWorker.register("/sw.js");
      const suscripcion = await registro.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
      });
      const json = suscripcion.toJSON();
      await fetch("/api/push/suscribir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(json),
      });
      setPushActivo(true);
    } catch (err) {
      console.error("No se pudo activar la notificación push:", err);
      setErrorPush("No se pudo activar. Inténtalo de nuevo.");
    } finally {
      setActivandoPush(false);
    }
  }

  async function marcarLeida(id: string) {
    setNotificaciones((prev) => prev.map((n) => (n.id === id ? { ...n, leida: true } : n)));
    setNoLeidas((n) => Math.max(0, n - 1));
    await fetch(`/api/notificaciones/${id}`, { method: "PATCH" }).catch(() => {});
  }

  async function marcarTodasLeidas() {
    setNotificaciones((prev) => prev.map((n) => ({ ...n, leida: true })));
    setNoLeidas(0);
    await fetch("/api/notificaciones/leer-todas", { method: "POST" }).catch(() => {});
  }

  return (
    <div className="relative" ref={contenedorRef}>
      <button
        onClick={() => setAbierto((v) => !v)}
        className="relative text-sm bg-white/15 hover:bg-white/25 rounded-lg px-3 py-1.5 transition-colors"
        title="Notificaciones"
      >
        🔔
        {noLeidas > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center">
            {noLeidas > 9 ? "9+" : noLeidas}
          </span>
        )}
      </button>

      {abierto && (
        <div className="absolute right-0 mt-2 w-72 sm:w-80 max-w-[calc(100vw-2rem)] max-h-[70vh] overflow-y-auto bg-white text-slate-800 rounded-xl shadow-xl border border-slate-200 z-30">
          <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100">
            <span className="font-semibold text-sm">Notificaciones</span>
            {noLeidas > 0 && (
              <button onClick={marcarTodasLeidas} className="text-[11px] text-admira-600 hover:underline">
                Marcar todas como leídas
              </button>
            )}
          </div>

          {pushActivo === false && (
            <div className="px-3 py-2 bg-amber-50 border-b border-amber-100">
              <p className="text-[11px] text-amber-800 mb-1.5">
                Activa las notificaciones para enterarte aunque tengas la app cerrada.
              </p>
              <button
                onClick={activarPush}
                disabled={activandoPush}
                className="text-[11px] font-medium bg-amber-600 hover:bg-amber-700 text-white rounded-lg px-2.5 py-1 disabled:opacity-60"
              >
                {activandoPush ? "Activando…" : "🔔 Activar notificaciones"}
              </button>
              {errorPush && <p className="text-[11px] text-amber-900 mt-1.5 whitespace-pre-wrap">{errorPush}</p>}
            </div>
          )}

          {notificaciones.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-6">No tienes notificaciones todavía.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {notificaciones.map((n) => (
                <button
                  key={n.id}
                  onClick={() => !n.leida && marcarLeida(n.id)}
                  className={`w-full text-left px-3 py-2.5 hover:bg-slate-50 transition-colors ${
                    n.leida ? "opacity-60" : "bg-admira-50/40"
                  }`}
                >
                  <div className="flex items-start gap-1.5">
                    {!n.leida && <span className="mt-1 w-1.5 h-1.5 rounded-full bg-admira-600 shrink-0" />}
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-slate-800">{n.titulo}</div>
                      <div className="text-[11px] text-slate-500">{n.mensaje}</div>
                      <div className="text-[10px] text-slate-400 mt-0.5">{tiempoRelativo(n.createdAt)}</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
