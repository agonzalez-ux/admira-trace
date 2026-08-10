/**
 * Configuración de los 5 documentos reales, cada uno como un Google Sheet
 * independiente (no pestañas dentro de un único libro). Cada uno replica el
 * nombre de archivo real y la lista de pestañas que tiene el Excel original;
 * solo la "pestaña principal" (dataTab) se sincroniza en vivo con los datos
 * de la app — el resto son pestañas placeholder que reproducen la estructura
 * original para que el archivo resulte familiar al abrirlo.
 */
export type DocumentKey = "materiales" | "incidencias" | "intervenciones" | "censo" | "estancos";

export const DOCUMENTOS: Record<
  DocumentKey,
  { titulo: string; dataTab: string; otrasPestañas: string[] }
> = {
  materiales: {
    titulo: "STOCK PANTALLAS FASE 5 AGOSTO 2026",
    dataTab: "STOCK",
    otrasPestañas: [
      "MATERIAL SIN SN",
      "BBDD NOV 25",
      "TFTs Rotas",
      'TFT 43 TECS',
      'TFT 32" TECS',
      'TFT 22"24" TECS',
      'TFT 13" TECS',
      "PCS TECS",
      "MATERIAL EXTRA",
      "STOCK BLU",
      "Routers",
      "SIMs",
      "SOLICITUD DE BAJA",
      "Resumen Routers MR6400",
      "Resumen Routers MR500",
      "Resumen Routers MR200 4G 2026",
      "SEGUIMIENTO TÉCNICOS",
      "Listado",
      "Routers Punto limpio",
    ],
  },
  incidencias: {
    titulo: "Plantilla Informe Incidencias Automatizado",
    dataTab: "Informe Final",
    otrasPestañas: [
      "Datos crudos Importados",
      "Total",
      "Cambio de router",
      "TECNICOS (NO BORRAR)",
      "TFTs",
      "No contestan",
      "Pendiente acción estanquero",
      "TFTs OK",
      "SVM",
      "SVM-Pendiente acción estanquero",
      "SVM-No contestan",
      "SVM OK",
      "Cambio router Modo de red 4G P",
      "Conectadas & -48h",
      "Cambio routers comerciales",
      "BBDD",
    ],
  },
  intervenciones: {
    titulo: "Intervenciones 2026 2do Semestre",
    dataTab: "Detalle",
    otrasPestañas: [
      "FALLIDAS POR COMERCIALES",
      "Esquema Resumen Diario",
      "Intervenciones x Persona",
      "Tareas Adicionales",
      "Sobrecostes KM",
      "Dashboard",
      "Datos2479-David Rosa",
      "Tiempo",
      "Estancos_Canarias",
      "Estancos_Peninsula",
      "Estancos_Portugal",
    ],
  },
  censo: {
    titulo: "5ª  FASE Censo_Total_APP",
    dataTab: "Censo_Pantallas",
    otrasPestañas: [
      "PROVINCIAS",
      "Listado técnicos",
      "MEDIDAS TFTS",
      "Provincia x tamaño TV",
      "NO TOCAR",
      'TFTs 13" por provincia',
      "Total Pendiente",
      "Datos3194-SOKA INFORMATIKA",
      "Datos3192-SARBELUC ATIC",
      "Datos3191-JOSE JAVIER LEYVA GUT",
      "Datos3190-JOSE JAVIER LEYVA GUT",
      "Altadis Blu",
      "Total Realizado 2025",
      "Remoto (Historico, NO USAR)",
      "zonas sin tec",
      "Instalaciones Pendientes",
      "Total Realizado 2026",
      "BBDD Universo Comerciales",
      "Remoto - no usar",
      "OKR (CARLOS)",
    ],
  },
  estancos: {
    titulo: "Universo Comerciales Agosto 2026",
    dataTab: "BBDD ESTANCOS",
    otrasPestañas: ["UPDATE", "Grupos Estancos", "Info Bea"],
  },
};

const ENV_VAR_BY_KEY: Record<DocumentKey, string> = {
  materiales: "GOOGLE_SHEETS_STOCK_ID",
  incidencias: "GOOGLE_SHEETS_INFORME_ID",
  intervenciones: "GOOGLE_SHEETS_INTERVENCIONES_ID",
  censo: "GOOGLE_SHEETS_CENSO_ID",
  estancos: "GOOGLE_SHEETS_ESTANCOS_ID",
};

export function getDocumentSpreadsheetId(key: DocumentKey): string | undefined {
  return process.env[ENV_VAR_BY_KEY[key]];
}

export function getDocumentUrl(key: DocumentKey): string | null {
  const id = getDocumentSpreadsheetId(key);
  return id ? `https://docs.google.com/spreadsheets/d/${id}/edit` : null;
}
