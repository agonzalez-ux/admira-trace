"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  onScan: (datos: { numeroSerie: string; imei?: string }) => void;
  onClose: () => void;
  // true para routers: además del número de serie, intenta leer también el
  // IMEI de la misma foto (suele venir en la misma etiqueta) y muestra un
  // segundo campo para revisarlo/corregirlo.
  pedirImei?: boolean;
};

/**
 * Intenta encontrar el número de serie dentro del texto crudo que devuelve el OCR.
 *
 * 1) Si aparece justo después de una palabra clave típica de etiqueta (S/N, SERIE,
 *    SERIAL NUMBER, SERIAL NO., REF, CÓDIGO...), nos quedamos con lo que sigue: es
 *    la señal más fiable.
 * 2) Si no, buscamos el token alfanumérico que más se parece a un número de serie
 *    (mezcla de letras y números) y nos quedamos con el más largo.
 *
 * Nunca es tan fiable como pedírselo a un modelo de visión, así que el resultado
 * siempre se muestra en un campo editable para que el técnico lo revise/corrija.
 */
function extraerCandidato(textoCrudo: string): { valor: string; tipo: string } | null {
  const texto = textoCrudo.toUpperCase();

  // "SERIAL" puede venir suelto (Shuttle: "S/N:"), o seguido de "NUMBER"/"NO."
  // antes de los dos puntos (Philips: "SERIAL NUMBER:", LG: "SERIAL NO.:") —
  // sin esto, la etiqueta se leía como si no hubiera palabra clave.
  const conPalabraClave = texto.match(
    /(?:S\/?N|SERIE|SERIAL\s*(?:NUMBER|NO\.?)?|N[ºO]\s*SERIE|REF(?:ERENCIA)?|C[OÓ]DIGO)[:\s.\-：]*([A-Z0-9][A-Z0-9-]{3,})/
  );
  if (conPalabraClave) {
    return { valor: conPalabraClave[1].replace(/[^A-Z0-9-]/g, ""), tipo: "serie" };
  }

  const tokens = texto.match(/[A-Z0-9-]{5,}/g) || [];
  const conLetrasYNumeros = tokens.filter((t) => /[A-Z]/.test(t) && /[0-9]/.test(t));
  const candidatos = conLetrasYNumeros.length > 0 ? conLetrasYNumeros : tokens;
  if (candidatos.length === 0) return null;

  candidatos.sort((a, b) => b.length - a.length);
  return { valor: candidatos[0], tipo: "detectado" };
}

/** El IMEI de un router siempre va etiquetado como tal y son 14-17 cifras. */
function extraerImei(textoCrudo: string): string | null {
  const m = textoCrudo.toUpperCase().match(/IMEI[:\s.\-：]*([0-9]{14,17})/);
  return m ? m[1] : null;
}

export default function SerialNumberScanner({ onScan, onClose, pedirImei = false }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [estado, setEstado] = useState<"camara" | "procesando" | "resultado">("camara");
  const [error, setError] = useState<string | null>(null);
  const [numeroSerie, setNumeroSerie] = useState("");
  const [tipoNumero, setTipoNumero] = useState<string | null>(null);
  const [imei, setImei] = useState("");
  const [textoCompleto, setTextoCompleto] = useState("");
  const [mostrarTextoCompleto, setMostrarTextoCompleto] = useState(false);

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

    setEstado("procesando");
    setError(null);

    try {
      // Tesseract.js: OCR gratuito y de código abierto que corre en el propio
      // navegador del técnico. No se sube ninguna foto a ningún servidor ni
      // hace falta clave de API.
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker("eng");
      const {
        data: { text },
      } = await worker.recognize(canvasRef.current);
      await worker.terminate();

      const textoLimpio = text.trim();
      setTextoCompleto(textoLimpio);

      const candidato = extraerCandidato(textoLimpio);
      if (!candidato) {
        setError(
          "No se detectó texto claro en la foto. Escribe el número a mano abajo, o vuelve a intentarlo con mejor luz/encuadre."
        );
        setNumeroSerie("");
        setTipoNumero(null);
      } else {
        setNumeroSerie(candidato.valor);
        setTipoNumero(candidato.tipo);
      }
      if (pedirImei) setImei(extraerImei(textoLimpio) || "");
      setEstado("resultado");
    } catch (err) {
      setError("Error leyendo la foto: " + (err instanceof Error ? err.message : "desconocido"));
      setEstado("camara");
    }
  };

  const aceptarNumero = () => {
    const valor = numeroSerie.trim();
    if (valor) {
      onScan({ numeroSerie: valor, imei: imei.trim() || undefined });
    }
  };

  const reintentar = () => {
    setEstado("camara");
    setNumeroSerie("");
    setTipoNumero(null);
    setImei("");
    setTextoCompleto("");
    setMostrarTextoCompleto(false);
    setError(null);
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex flex-col items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-4 w-full max-w-sm">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">
            {estado === "camara" && (pedirImei ? "Capturar número de serie e IMEI" : "Capturar número de serie")}
            {estado === "procesando" && "Leyendo foto..."}
            {estado === "resultado" && "Número de serie detectado"}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">
            ×
          </button>
        </div>

        {/* ESTADO: CÁMARA */}
        {estado === "camara" && (
          <>
            <div className="relative bg-black rounded-lg overflow-hidden aspect-video mb-3">
              <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
              <div className="absolute inset-0 border-2 border-yellow-400 opacity-50" />
              <div className="absolute bottom-3 left-0 right-0 text-center text-white text-xs bg-black/50 py-2">
                {pedirImei
                  ? "Encuadra la etiqueta de forma que se vean el S/N y el IMEI a la vez, bien enfocados"
                  : "Encuadra el número de serie en el centro, bien enfocado"}
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
            <p className="text-sm text-slate-600">Leyendo la etiqueta...</p>
            <p className="text-xs text-slate-400 mt-2">OCR gratuito, en tu propio dispositivo</p>
          </div>
        )}

        {/* ESTADO: RESULTADO */}
        {estado === "resultado" && (
          <>
            {tipoNumero ? (
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 mb-3">
                <p className="text-xs text-emerald-600">
                  {tipoNumero === "serie"
                    ? "✅ Detectado junto a una etiqueta reconocible (S/N, SERIE, REF...)"
                    : "🔎 Mejor texto detectado — revísalo antes de aceptar"}
                </p>
              </div>
            ) : (
              error && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-3">
                  <p className="text-xs text-amber-700">{error}</p>
                </div>
              )
            )}

            <label className="block text-xs text-slate-500 mb-1">
              Número de serie (revisa y corrige si hace falta)
            </label>
            <input
              value={numeroSerie}
              onChange={(e) => setNumeroSerie(e.target.value.toUpperCase())}
              placeholder="Escribe o corrige el número aquí"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono mb-2"
              autoFocus
            />

            {pedirImei && (
              <>
                <label className="block text-xs text-slate-500 mb-1">
                  IMEI (revisa y corrige si hace falta — déjalo en blanco si no se ve en la foto)
                </label>
                <input
                  value={imei}
                  onChange={(e) => setImei(e.target.value.replace(/[^0-9]/g, ""))}
                  placeholder="15 dígitos, junto a la etiqueta IMEI"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono mb-2"
                />
              </>
            )}

            {textoCompleto && (
              <button
                type="button"
                onClick={() => setMostrarTextoCompleto((v) => !v)}
                className="text-[11px] text-admira-600 hover:underline mb-2"
              >
                {mostrarTextoCompleto ? "Ocultar" : "Ver"} todo el texto detectado
              </button>
            )}
            {mostrarTextoCompleto && (
              <div className="bg-slate-50 rounded-lg p-2 mb-2 text-[11px] text-slate-500 whitespace-pre-wrap max-h-24 overflow-y-auto">
                {textoCompleto || "(sin texto)"}
              </div>
            )}

            <button
              onClick={aceptarNumero}
              disabled={!numeroSerie.trim()}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2 px-4 rounded-lg transition mb-2 disabled:opacity-50"
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
        <canvas ref={canvasRef} width={1280} height={720} className="hidden" />
      </div>
    </div>
  );
}
