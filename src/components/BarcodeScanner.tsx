"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  onScan: (code: string) => void;
  onClose: () => void;
};

export default function BarcodeScanner({ onScan, onClose }: Props) {
  const containerId = useRef(`scanner-${Math.random().toString(36).slice(2)}`);
  const scannerRef = useRef<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState("");

  useEffect(() => {
    let cancelled = false;

    import("html5-qrcode").then(({ Html5Qrcode }) => {
      if (cancelled) return;
      const scanner = new Html5Qrcode(containerId.current);
      scannerRef.current = scanner;

      scanner
        .start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 250, height: 150 } },
          (decodedText: string) => {
            onScan(decodedText);
          },
          () => {
            // ignore per-frame decode failures
          }
        )
        .catch((err: any) => {
          setError(
            "No se ha podido acceder a la cámara. Puedes introducir el código manualmente. (" +
              (err?.message || err) +
              ")"
          );
        });
    });

    return () => {
      cancelled = true;
      const scanner = scannerRef.current;
      if (scanner) {
        scanner
          .stop()
          .then(() => scanner.clear())
          .catch(() => {});
      }
    };
  }, [onScan]);

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex flex-col items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-4 w-full max-w-sm">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">Escanear código de barras</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">
            ×
          </button>
        </div>
        <div id={containerId.current} className="rounded-lg overflow-hidden bg-black" />
        {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
        <div className="mt-4 flex gap-2">
          <input
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            placeholder="Introducir código manualmente"
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            onClick={() => manual.trim() && onScan(manual.trim())}
            className="bg-admira-600 text-white rounded-lg px-3 py-2 text-sm"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
