"use client";

import { useState } from "react";
import Tabs from "@/components/Tabs";
import EnviosBoard from "@/components/envios/EnviosBoard";
import MaterialOverview from "@/components/materiales/MaterialOverview";
import MaterialCreateForm from "@/components/materiales/MaterialCreateForm";
import ExportButtons from "@/components/ExportButtons";

export default function FdmDashboard() {
  const [materialKey, setMaterialKey] = useState(0);

  return (
    <Tabs
      tabs={[
        {
          key: "envios",
          label: "Envíos y recogidas",
          content: (
            <div>
              <p className="text-sm text-slate-500 mb-3">
                Aquí verás las notificaciones de material que Admira solicita enviar, y las recogidas que hay que
                confirmar a la vuelta. Escanea el código de barras de cada pieza al prepararla / recibirla.
              </p>
              <EnviosBoard role="FDM" />
            </div>
          ),
        },
        {
          key: "almacen",
          label: "Almacén",
          content: (
            <div className="space-y-4">
              <MaterialCreateForm onCreated={() => setMaterialKey((k) => k + 1)} />
              <MaterialOverview key={materialKey} />
            </div>
          ),
        },
        {
          key: "export",
          label: "Exportar",
          content: (
            <ExportButtons
              tables={[{ key: "materiales", label: "Material" }, { key: "envios", label: "Envíos y recogidas" }]}
              documentos={[{ key: "materiales", nota: "Stock de material (pantallas, routers…)" }]}
            />
          ),
        },
      ]}
    />
  );
}
