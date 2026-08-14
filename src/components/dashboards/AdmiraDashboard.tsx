"use client";

import { useState } from "react";
import Link from "next/link";
import Tabs from "@/components/Tabs";
import MaterialOverview from "@/components/materiales/MaterialOverview";
import MaterialCreateForm from "@/components/materiales/MaterialCreateForm";
import EnviosBoard from "@/components/envios/EnviosBoard";
import EnvioCreateForm from "@/components/envios/EnvioCreateForm";
import IncidenciasBoard from "@/components/incidencias/IncidenciasBoard";
import IncidenciaCreateForm from "@/components/incidencias/IncidenciaCreateForm";
import ExportButtons from "@/components/ExportButtons";
import TecnicosList from "@/components/tecnicos/TecnicosList";
import CleanupPanel from "@/components/admin/CleanupPanel";

export default function AdmiraDashboard() {
  const [materialKey, setMaterialKey] = useState(0);
  const [envioKey, setEnvioKey] = useState(0);
  const [incidenciaKey, setIncidenciaKey] = useState(0);

  return (
    <Tabs
      tabs={[
        {
          key: "material",
          label: "Material",
          content: (
            <div className="space-y-4">
              <MaterialCreateForm almacen="Admira" onCreated={() => setMaterialKey((k) => k + 1)} />
              <MaterialOverview key={materialKey} />
            </div>
          ),
        },
        {
          key: "envios",
          label: "Envíos y recogidas",
          content: (
            <div className="space-y-4">
              <EnvioCreateForm onCreated={() => setEnvioKey((k) => k + 1)} />
              <EnviosBoard key={envioKey} role="ADMIRA" />
            </div>
          ),
        },
        {
          key: "incidencias",
          label: "Incidencias",
          content: (
            <div className="space-y-4">
              <IncidenciaCreateForm onCreated={() => setIncidenciaKey((k) => k + 1)} />
              <IncidenciasBoard key={incidenciaKey} role="ADMIRA" />
            </div>
          ),
        },
        { key: "tecnicos", label: "Técnicos", content: <TecnicosList /> },
        {
          key: "importar",
          label: "Importar",
          content: (
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-900">
                  ℹ️ Accede a <Link href="/admira/importar-datos" className="font-semibold underline hover:text-blue-700">
                    la página de importación completa
                  </Link> para subir archivos Excel de comerciales e instalaciones.
                </p>
              </div>
            </div>
          ),
        },
        { key: "export", label: "Exportar", content: <ExportButtons /> },
        {
          key: "mantenimiento",
          label: "🔧 Mantenimiento",
          content: <CleanupPanel />,
        },
      ]}
    />
  );
}
