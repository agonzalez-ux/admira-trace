"use client";

import Tabs from "@/components/Tabs";
import MiMaterialList from "@/components/materiales/MiMaterialList";
import EnviosBoard from "@/components/envios/EnviosBoard";
import IncidenciasBoard from "@/components/incidencias/IncidenciasBoard";
import WhatsAppButton from "@/components/incidencias/WhatsAppButton";

export default function TecnicoDashboard() {
  return (
    <Tabs
      tabs={[
        {
          key: "material",
          label: "Mi material",
          content: (
            <div className="space-y-5">
              <MiMaterialList />
              <div>
                <h3 className="font-semibold text-slate-800 mb-1">Recibo de material</h3>
                <p className="text-xs text-slate-500 mb-3">
                  Envíos y recogidas pendientes de confirmar. Escanea el código de barras de cada pieza cuando te
                  llegue.
                </p>
                <EnviosBoard role="TECNICO" />
              </div>
            </div>
          ),
        },
        { key: "incidencias", label: "Incidencias", content: <IncidenciasBoard role="TECNICO" /> },
        {
          key: "whatsapp",
          label: "Contacto",
          content: (
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 space-y-3">
              <h3 className="font-semibold text-slate-800">Contacto directo Admira</h3>
              <p className="text-sm text-slate-500">
                Para nuevas instalaciones, envía la foto del código QR directamente por WhatsApp indicando el nombre
                del punto de venta.
              </p>
              <WhatsAppButton
                phone={process.env.NEXT_PUBLIC_WHATSAPP_PHONE || "34600000000"}
                text="Hola, os envío la foto del código QR de la nueva instalación."
                label="Abrir chat de WhatsApp"
              />
            </div>
          ),
        },
      ]}
    />
  );
}
