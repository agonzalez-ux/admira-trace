import type { MetadataRoute } from "next";

// Esto NO convierte Admira Trace en una app aparte — sigue siendo una web
// normal, se abre igual en cualquier navegador y las notificaciones se
// activan igual desde una pestaña normal (Android, escritorio...). Este
// archivo solo existe por el caso de iPhone/iPad: Apple, a partir de iOS
// 16.4, solo concede permiso de notificaciones push a una web que se ha
// añadido a la pantalla de inicio — una restricción del propio Safari/iOS,
// no algo que dependa de este código, y que afecta a cualquier web con
// notificaciones push, no solo a esta.
//
// display: "standalone" es imprescindible para ese caso — es justo lo que
// hace que, al abrirla desde el icono de la pantalla de inicio, iOS la
// trate como "instalada" (sin la barra de Safari) y conceda el permiso de
// notificaciones; con "browser" Safari la sigue abriendo dentro de su propia
// interfaz aunque esté "añadida", y el permiso nunca llega a concederse
// (esto se probó y confirmó en un iPhone real). El efecto secundario en
// Android/Chrome es que puede sugerir "instalar" la web con su propio aviso
// — se puede ignorar sin problema, no hace falta instalarla para nada, y no
// afecta en absoluto a activar las notificaciones ahí.
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
