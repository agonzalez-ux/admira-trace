import type { MetadataRoute } from "next";

// Esto NO convierte Admira Trace en una app aparte — sigue siendo una web
// normal, se abre igual en cualquier navegador y las notificaciones se
// activan igual desde una pestaña normal (Android, escritorio...). Este
// archivo solo existe por el caso de iPhone/iPad: Apple, a partir de iOS
// 16.4, solo concede permiso de notificaciones push a una web que se ha
// añadido a la pantalla de inicio — es una restricción del propio Safari/
// iOS, no algo que dependa de este código, y afecta a cualquier web con
// notificaciones push, no solo a esta. `display: "browser"` (en vez de
// "standalone") evita además que Chrome/Android la trate como una app
// instalable con su propio aviso — sigue siendo solo una web con icono.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Admira Trace",
    short_name: "Admira Trace",
    description: "Gestión de instalaciones e inventario — Altadis",
    start_url: "/",
    display: "browser",
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
