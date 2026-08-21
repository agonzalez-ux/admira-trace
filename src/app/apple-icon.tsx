import { ImageResponse } from "next/og";

export const runtime = "edge";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// iOS usa esto como icono al "Añadir a pantalla de inicio" — imprescindible
// para poder abrir la app en modo standalone, que es el único modo en el que
// iOS permite activar notificaciones push (a partir de iOS 16.4).
export default function AppleIcon() {
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
          color: "white",
          fontSize: 90,
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
