import { ImageResponse } from "next/og";

export const runtime = "edge";

// 512×512 sirve de sobra tanto para el favicon de la pestaña (el navegador
// lo reduce) como para el icono de "Añadir a pantalla de inicio" en Android
// (manifest.ts), sin tener que generar/mantener varios tamaños.
export const size = { width: 512, height: 512 };
export const contentType = "image/png";

// Favicon/icono de la app generado en el propio build (sin necesitar un
// archivo de imagen aparte) — mismo azul que la cabecera de Admira.
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#1f3fc4",
          borderRadius: 112,
          color: "white",
          fontSize: 270,
          fontWeight: 700,
          fontFamily: "sans-serif",
        }}
      >
        AT
      </div>
    ),
    { ...size }
  );
}
