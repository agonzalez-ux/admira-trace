import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Admira Trace",
  description: "Gestión de instalaciones e inventario — Altadis",
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
