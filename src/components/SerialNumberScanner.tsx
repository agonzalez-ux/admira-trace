"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  onScan: (codigo: string) => void;
  onClose: () => void;
};

export default function SerialNumberScanner({ onScan, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [estado, setEstado] = useState<"camara" | "procesando" | "resultado">("camara");
  const [error, setError] = useState<string | null>(null);
  const [numeroSerie, setNumeroSerie] = useState<string | null>(null);
  const [tipoNumero, setTipoNumero] = useState<string | null>(null);

  // Inicializar cámara
  useEffect(() => {
    let mounted = true;

    const iniciarCamara = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });

        if (mounted && videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        if (mounted) {
          setError(
            "No se pudo acceder a la cámara. " + (err instanceof Error ? err.message : "Error desconocido")
          );
        }
      }
    };

    iniciarCamara();

    return () => {
      mounted = false;
      if (videoRef.current?.srcObject) {
        const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
        tracks.forEach((track) => track.stop());
      }
    };
  }, []);

  const capturarFoto = async () => {
    if (!videoRef.current || !canvasRef.current) return;

    const context = canvasRef.current.getContext("2d");
    if (!context) return;

    // Dibujar frame actual del video en el canvas
    context.drawImage(videoRef.current, 0, 0, canvasRef.current.width, canvasRef.current.height);

    // Convertir canvas a blob
    canvasRef.current.toBlob(
      async (blob) => {
        if (!blob) {
          setError("Error capturando foto");
          return;
        }

        setEstado("procesando");
        setError(null);

        try {
          // Enviar foto al servidor
          const formData = new FormData();
          formData.append("imagen", blob, "foto.jpg");

          const res = await fetch("/api/materiales/extraer-numero-serie", {
            method: "POST",
            body: formData,
          });

          const data = await res.json();

          if (!res.ok) {
            setError(data.error || "Error extrayendo número de serie");
            setEstado("camara");
            return;
          }

          // Mostrar resultado
          setNumeroSerie(data.numeroSerie);
          setTipoNumero(data.tipo);
          setEstado("resultado");
        } catch (err) {
          setError("Error comunicando con el servidor");
          setEstado("camara");
        }
      },
      "image/jpeg",
      0.9
    );
  };

  const aceptarNumero = () => {
    if (numeroSerie) {
      onScan(numeroSerie);
    }
  };

  const reintentar = () => {
    setEstado("camara");
    setNumeroSerie(null);
    setTipoNumero(null);
    setError(null);
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex flex-col items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-4 w-full max-w-sm">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">
            {estado === "camara" && "Capturar número de serie"}
            {estado === "procesando" && "Analizando foto..."}
            {estado === "resultado" && "Número de serie extraído"}
          </h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-xl leading-none"
          >
            ×
          </button>
        </div>

        {/* ESTADO: CÁMARA */}
        {estado === "camara" && (
          <>
            <div className="relative bg-black rounded-lg overflow-hidden aspect-video mb-3">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 border-2 border-yellow-400 opacity-50" />
              <div className="absolute bottom-3 left-0 right-0 text-center text-white text-xs bg-black/50 py-2">
                Encuadra el número de serie en el centro
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-2 mb-3 text-xs text-red-700">
                {error}
              </div>
            )}

            <button
              onClick={capturarFoto}
              className="w-full bg-yellow-500 hover:bg-yellow-600 text-white font-semibold py-2 px-4 rounded-lg transition"
            >
              📸 Capturar foto
            </button>

            <button
              onClick={onClose}
              className="w-full mt-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold py-2 px-4 rounded-lg transition"
            >
              Cancelar
            </button>
          </>
        )}

        {/* ESTADO: PROCESANDO */}
        {estado === "procesando" && (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-yellow-500 mx-auto mb-3" />
            <p className="text-sm text-slate-600">Extrayendo número de serie...</p>
            <p className="text-xs text-slate-400 mt-2">
              Utilizando visión artificial para leer la etiqueta
            </p>
          </div>
        )}

        {/* ESTADO: RESULTADO */}
        {estado === "resultado" && (
          <>
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 mb-3">
              <p className="text-xs text-emerald-600 mb-2">✅ Número extraído correctamente</p>
              <div className="bg-white rounded-lg p-2 border border-emerald-100">
                <p className="text-xs text-slate-600 mb-1">
                  <span className="font-semibold capitalize">{tipoNumero}:</span>
                </p>
                <p className="text-lg font-mono font-bold text-emerald-700 break-all">
                  {numeroSerie}
                </p>
              </div>
            </div>

            <button
              onClick={aceptarNumero}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2 px-4 rounded-lg transition mb-2"
            >
              ✓ Aceptar
            </button>

            <button
              onClick={reintentar}
              className="w-full bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold py-2 px-4 rounded-lg transition"
            >
              🔄 Reintentar
            </button>
          </>
        )}

        {/* Canvas invisible para capturar frames */}
        <canvas
          ref={canvasRef}
          width={1280}
          height={720}
          className="hidden"
        />
      </div>
    </div>
  );
}
