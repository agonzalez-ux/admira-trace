"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { PROYECTOS, Proyecto } from "./constants";

const STORAGE_KEY = "admira-trace:proyecto";
const DEFAULT_PROYECTO: Proyecto = "PENINSULA";

type ProyectoContextValue = {
  proyecto: Proyecto;
  setProyecto: (p: Proyecto) => void;
  // false cuando no hay <ProyectoProvider> por encima (p. ej. dentro del
  // portal FDM, que no tiene selector de proyecto) — los componentes
  // compartidos con FDM (MaterialCreateForm, MaterialOverview...) lo miran
  // para decidir si de verdad hay que filtrar/enviar el proyecto, en vez de
  // aplicar a ciegas el valor por defecto y esconderle material a FDM.
  activo: boolean;
};

// Valor por defecto (sin Provider): Península, activo=false, y un setter que
// no hace nada. Así, cualquier componente compartido con el portal FDM
// (que no envuelve su árbol en <ProyectoProvider>, porque el selector es
// solo para Admira) puede usar useProyecto() sin reventar.
const ProyectoContext = createContext<ProyectoContextValue>({
  proyecto: DEFAULT_PROYECTO,
  setProyecto: () => {},
  activo: false,
});

/**
 * Envuelve el portal de Admira: guarda qué proyecto está seleccionado
 * (persistido en localStorage, primer caso de este patrón en el repo) y lo
 * expone a toda la pantalla — el selector de la cabecera y cada pestaña
 * (Incidencias, Material, Técnicos...) leen de aquí para filtrar su vista.
 */
export function ProyectoProvider({ children }: { children: React.ReactNode }) {
  const [proyecto, setProyectoState] = useState<Proyecto>(DEFAULT_PROYECTO);

  useEffect(() => {
    try {
      const guardado = window.localStorage.getItem(STORAGE_KEY);
      if (guardado && (PROYECTOS as readonly string[]).includes(guardado)) {
        setProyectoState(guardado as Proyecto);
      }
    } catch {
      // localStorage puede no estar disponible (modo privado muy restrictivo,
      // etc.) — en ese caso simplemente se queda en el proyecto por defecto.
    }
  }, []);

  function setProyecto(p: Proyecto) {
    setProyectoState(p);
    try {
      window.localStorage.setItem(STORAGE_KEY, p);
    } catch {
      // Ignorar: como mucho no se recuerda entre sesiones.
    }
  }

  return <ProyectoContext.Provider value={{ proyecto, setProyecto, activo: true }}>{children}</ProyectoContext.Provider>;
}

export function useProyecto(): ProyectoContextValue {
  return useContext(ProyectoContext);
}
