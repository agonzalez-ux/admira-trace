import type { MetadataRoute } from "next";

// Permite "Añadir a pantalla de inicio" en Android/iOS. En iOS (16.4+) esto
// es imprescindible para poder activar notificaciones push: Safari solo
// concede permiso de notificación a la app instalada en modo standalone, no
// a una pestaña normal — ver el aviso en NotificationBell.tsx.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Admira Trace",
    short_name: "Admira Trace",
    description: "Gestión de instalaciones e inventario — Altadis",
    start_url: "/",
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: "#1f3fc4",
    icons: [
      {
        src: "/icon",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
