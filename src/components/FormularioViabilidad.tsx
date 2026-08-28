"use client";

import { useEffect, useState } from "react";

type EstadoCarga = "comprobando" | "valido" | "invalido" | "enviando" | "hecho";

export default function FormularioViabilidad({ token }: { token: string }) {
  const [estado, setEstado] = useState<EstadoCarga>("comprobando");
  const [error, setError] = useState<string | null>(null);
  const [estancoNombre, setEstancoNombre] = useState("");
  const [direccion, setDireccion] = useState("");
  const [materialSolicitado, setMaterialSolicitado] = useState("");

  const [materialConfirmado, setMaterialConfirmado] = useState<"si" | "no" | "">("");
  const [materialCorreccion, setMaterialCorreccion] = useState("");
  const [tipoUbicacion, setTipoUbicacion] = useState<"HUECO" | "PARED" | "">("");
  const [medidasAncho, setMedidasAncho] = useState("");
  const [medidasAlto, setMedidasAlto] = useState("");
  const [medidasFondo, setMedidasFondo] = useState("");
  const [puntosElectricos, setPuntosElectricos] = useState<"si" | "no" | "">("");
  const [puntosElectricosComentario, setPuntosElectricosComentario] = useState("");
  const [sePuedeTaladrar, setSePuedeTaladrar] = useState<"si" | "no" | "">("");
  const [comentarios, setComentarios] = useState("");
  const [respondidoPorNombre, setRespondidoPorNombre] = useState("");
  const [fotos, setFotos] = useState<FileList | null>(null);

  useEffect(() => {
    if (!token) {
      setEstado("invalido");
      setError("Falta el enlace del formulario.");
      return;
    }
    fetch(`/api/formulario-viabilidad?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.valido) {
          setEstancoNombre(d.estancoNombre || "");
          setDireccion(d.direccion || "");
          setMaterialSolicitado(d.materialSolicitado || "");
          setEstado("valido");
        } else {
          setEstado("invalido");
          setError(d.error || "El enlace no es válido o ha caducado.");
        }
      })
      .catch(() => {
        setEstado("invalido");
        setError("No se ha podido comprobar el enlace.");
      });
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!materialConfirmado || !tipoUbicacion || !puntosElectricos || !sePuedeTaladrar) {
      setError("Responde a todas las preguntas antes de enviar.");
      return;
    }
    if (materialConfirmado === "no" && !materialCorreccion.trim()) {
      setError("Indica cuál es el material/tamaño correcto.");
      return;
    }
    if (tipoUbicacion === "HUECO" && (!medidasAncho || !medidasAlto || !medidasFondo)) {
      setError("Indica las 3 medidas del hueco.");
      return;
    }

    setEstado("enviando");
    const formData = new FormData();
    formData.append("token", token);
    formData.append("materialConfirmado", materialConfirmado === "si" ? "true" : "false");
    formData.append("materialCorreccion", materialCorreccion);
    formData.append("tipoUbicacion", tipoUbicacion);
    if (tipoUbicacion === "HUECO") {
      formData.append("medidasAncho", medidasAncho);
      formData.append("medidasAlto", medidasAlto);
      formData.append("medidasFondo", medidasFondo);
    }
    formData.append("puntosElectricosCercanos", puntosElectricos === "si" ? "true" : "false");
    formData.append("puntosElectricosComentario", puntosElectricosComentario);
    formData.append("sePuedeTaladrar", sePuedeTaladrar === "si" ? "true" : "false");
    formData.append("comentarios", comentarios);
    formData.append("respondidoPorNombre", respondidoPorNombre);
    if (fotos) {
      Array.from(fotos).forEach((f) => formData.append("fotos", f));
    }

    const res = await fetch("/api/formulario-viabilidad", { method: "POST", body: formData });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setEstado("valido");
      setError(data.error || "No se ha podido enviar el formulario.");
      return;
    }
    setEstado("hecho");
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-admira-900 to-admira-700 px-4 py-8">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-lg p-6">
        <h1 className="font-bold text-lg text-slate-800 mb-1">Confirmar viabilidad de instalación</h1>

        {estado === "comprobando" && <p className="text-sm text-slate-400">Comprobando el enlace…</p>}

        {estado === "invalido" && <p className="text-sm text-red-600">{error}</p>}

        {estado === "hecho" && (
          <p className="text-sm text-emerald-600">
            ¡Gracias! Hemos recibido tus respuestas. El equipo de Admira las revisará antes de programar la
            instalación.
          </p>
        )}

        {(estado === "valido" || estado === "enviando") && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <p className="text-xs text-slate-500">
              {estancoNombre}
              {direccion ? ` — ${direccion}` : ""}
            </p>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Material solicitado: <span className="font-normal">{materialSolicitado}</span>
              </label>
              <p className="text-xs text-slate-500 mb-1.5">¿Es correcto el número/tamaño de material a instalar?</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setMaterialConfirmado("si")}
                  className={`flex-1 rounded-lg py-2 text-sm font-medium ${materialConfirmado === "si" ? "bg-admira-600 text-white" : "bg-slate-100 text-slate-600"}`}
                >
                  Sí, correcto
                </button>
                <button
                  type="button"
                  onClick={() => setMaterialConfirmado("no")}
                  className={`flex-1 rounded-lg py-2 text-sm font-medium ${materialConfirmado === "no" ? "bg-admira-600 text-white" : "bg-slate-100 text-slate-600"}`}
                >
                  No, es distinto
                </button>
              </div>
              {materialConfirmado === "no" && (
                <input
                  value={materialCorreccion}
                  onChange={(e) => setMaterialCorreccion(e.target.value)}
                  placeholder="¿Cuál es el material/tamaño correcto?"
                  className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">¿Es un hueco o una pared?</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setTipoUbicacion("HUECO")}
                  className={`flex-1 rounded-lg py-2 text-sm font-medium ${tipoUbicacion === "HUECO" ? "bg-admira-600 text-white" : "bg-slate-100 text-slate-600"}`}
                >
                  Hueco
                </button>
                <button
                  type="button"
                  onClick={() => setTipoUbicacion("PARED")}
                  className={`flex-1 rounded-lg py-2 text-sm font-medium ${tipoUbicacion === "PARED" ? "bg-admira-600 text-white" : "bg-slate-100 text-slate-600"}`}
                >
                  Pared
                </button>
              </div>
              {tipoUbicacion === "HUECO" && (
                <div className="mt-2 grid grid-cols-3 gap-2">
                  <input
                    type="number"
                    value={medidasAncho}
                    onChange={(e) => setMedidasAncho(e.target.value)}
                    placeholder="Ancho (cm)"
                    className="rounded-lg border border-slate-300 px-2 py-2 text-sm"
                  />
                  <input
                    type="number"
                    value={medidasAlto}
                    onChange={(e) => setMedidasAlto(e.target.value)}
                    placeholder="Alto (cm)"
                    className="rounded-lg border border-slate-300 px-2 py-2 text-sm"
                  />
                  <input
                    type="number"
                    value={medidasFondo}
                    onChange={(e) => setMedidasFondo(e.target.value)}
                    placeholder="Fondo (cm)"
                    className="rounded-lg border border-slate-300 px-2 py-2 text-sm"
                  />
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">¿Hay puntos eléctricos cerca?</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPuntosElectricos("si")}
                  className={`flex-1 rounded-lg py-2 text-sm font-medium ${puntosElectricos === "si" ? "bg-admira-600 text-white" : "bg-slate-100 text-slate-600"}`}
                >
                  Sí
                </button>
                <button
                  type="button"
                  onClick={() => setPuntosElectricos("no")}
                  className={`flex-1 rounded-lg py-2 text-sm font-medium ${puntosElectricos === "no" ? "bg-admira-600 text-white" : "bg-slate-100 text-slate-600"}`}
                >
                  No
                </button>
              </div>
              {puntosElectricos === "si" && (
                <input
                  value={puntosElectricosComentario}
                  onChange={(e) => setPuntosElectricosComentario(e.target.value)}
                  placeholder="A qué distancia, dónde exactamente… (opcional)"
                  className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">¿Se puede taladrar en el sitio?</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setSePuedeTaladrar("si")}
                  className={`flex-1 rounded-lg py-2 text-sm font-medium ${sePuedeTaladrar === "si" ? "bg-admira-600 text-white" : "bg-slate-100 text-slate-600"}`}
                >
                  Sí
                </button>
                <button
                  type="button"
                  onClick={() => setSePuedeTaladrar("no")}
                  className={`flex-1 rounded-lg py-2 text-sm font-medium ${sePuedeTaladrar === "no" ? "bg-admira-600 text-white" : "bg-slate-100 text-slate-600"}`}
                >
                  No
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Fotos del sitio de instalación</label>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => setFotos(e.target.files)}
                className="w-full text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Comentarios (opcional)</label>
              <textarea
                value={comentarios}
                onChange={(e) => setComentarios(e.target.value)}
                rows={2}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Tu nombre</label>
              <input
                value={respondidoPorNombre}
                onChange={(e) => setRespondidoPorNombre(e.target.value)}
                placeholder="Para saber quién ha contestado"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button
              disabled={estado === "enviando"}
              className="w-full bg-admira-600 hover:bg-admira-700 text-white font-medium rounded-lg py-2.5 disabled:opacity-60"
            >
              {estado === "enviando" ? "Enviando…" : "Enviar respuestas"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
