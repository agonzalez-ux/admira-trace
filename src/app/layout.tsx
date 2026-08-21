import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Admira Trace",
  description: "Gestión de instalaciones e inventario — Altadis",
  // "Añadir a pantalla de inicio" en iOS (Safari no lee manifest.json para
  // esto, hace falta esta meta aparte) — necesario para poder activar
  // notificaciones push en iPhone, ver NotificationBell.tsx.
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Admira Trace",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1f3fc4",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
