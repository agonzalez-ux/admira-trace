import { google } from "googleapis";
import { prisma } from "./prisma";
import {
  ESTADO_MATERIAL_LABELS,
  ESTADO_ENVIO_LABELS,
  ESTADO_INCIDENCIA_LABELS,
  TIPO_MATERIAL_LABELS,
  TIPO_INCIDENCIA_LABELS,
} from "./constants";
import { DOCUMENTOS, DocumentKey, getDocumentSpreadsheetId, getDocumentUrl } from "./documentSheets";
import { etiquetaTipo } from "./materialLabel";

// "Libro combinado": sigue existiendo para las 2 pestañas que no tienen un
// documento real propio (Envíos y Técnicos). Los 5 documentos reales viven
// cada uno en su propio Google Sheet independiente (ver documentSheets.ts).
const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
const CLIENT_EMAIL = process.env.GOOGLE_SHEETS_CLIENT_EMAIL;
// La clave privada en .env suele llevar "\n" escapados; hay que restaurar los saltos de línea reales.
const PRIVATE_KEY = process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\\n/g, "\n");

export const SHEETS_CONFIGURED = Boolean(SPREADSHEET_ID && CLIENT_EMAIL && PRIVATE_KEY);

export const SHEETS_URL = SPREADSHEET_ID
  ? `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit`
  : null;

const SHEET_NAMES = {
  envios: "Envíos y recogidas",
  tecnicos: "Técnicos",
} as const;

const DOCUMENT_KEYS: DocumentKey[] = ["materiales", "incidencias", "intervenciones", "censo", "estancos"];

let sheetsClient: ReturnType<typeof google.sheets> | null = null;

function getClient() {
  if (!CLIENT_EMAIL || !PRIVATE_KEY) return null;
  if (sheetsClient) return sheetsClient;

  const auth = new google.auth.JWT({
    email: CLIENT_EMAIL,
    key: PRIVATE_KEY,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  sheetsClient = google.sheets({ version: "v4", auth });
  return sheetsClient;
}

// --- Utilidades genéricas, parametrizadas por spreadsheetId ---------------

const ensuredTabsCache = new Set<string>(); // spreadsheetId ya comprobado
const ensureTabsPromises = new Map<string, Promise<void>>();

async function ensureTabsExist(spreadsheetId: string, tabNames: string[]) {
  const sheets = getClient();
  if (!sheets || ensuredTabsCache.has(spreadsheetId)) return;

  if (!ensureTabsPromises.has(spreadsheetId)) {
    const promise = (async () => {
      const meta = await sheets.spreadsheets.get({ spreadsheetId });
      const existing = new Set((meta.data.sheets || []).map((s) => s.properties?.title));

      const missing = tabNames.filter((name) => !existing.has(name));
      if (missing.length > 0) {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: { requests: missing.map((title) => ({ addSheet: { properties: { title } } })) },
        });
      }
      ensuredTabsCache.add(spreadsheetId);
    })().catch((err) => {
      ensureTabsPromises.delete(spreadsheetId);
      throw err;
    });
    ensureTabsPromises.set(spreadsheetId, promise);
  }

  await ensureTabsPromises.get(spreadsheetId);
}

const CHUNK_SIZE = 2000; // filas por petición, para no exceder el tamaño máximo de la API

const sheetIdCache = new Map<string, number>(); // clave: `${spreadsheetId}:${tab}`

async function getSheetId(spreadsheetId: string, tab: string): Promise<number | null> {
  const sheets = getClient();
  if (!sheets) return null;
  const cacheKey = `${spreadsheetId}:${tab}`;
  if (sheetIdCache.has(cacheKey)) return sheetIdCache.get(cacheKey)!;

  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  for (const s of meta.data.sheets || []) {
    if (s.properties?.title && s.properties.sheetId !== undefined && s.properties.sheetId !== null) {
      sheetIdCache.set(`${spreadsheetId}:${s.properties.title}`, s.properties.sheetId);
    }
  }
  return sheetIdCache.get(cacheKey) ?? null;
}

// Una pestaña recién creada solo tiene ~1000-2000 filas de cuadrícula; si el
// dataset a escribir es más grande (p. ej. el directorio de estancos) hay que
// ampliarla antes o la escritura falla con "exceeds grid limits".
async function ensureRowCapacity(spreadsheetId: string, tab: string, filasNecesarias: number) {
  const sheets = getClient();
  if (!sheets) return;
  const sheetId = await getSheetId(spreadsheetId, tab);
  if (sheetId === null) return;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          updateSheetProperties: {
            properties: { sheetId, gridProperties: { rowCount: Math.max(filasNecesarias + 20, 1000) } },
            fields: "gridProperties.rowCount",
          },
        },
      ],
    },
  });
}

async function writeSheet(spreadsheetId: string | undefined, tab: string, header: string[], rows: (string | number)[][]) {
  const sheets = getClient();
  if (!sheets || !spreadsheetId) return;

  await ensureTabsExist(spreadsheetId, [tab]);
  await ensureRowCapacity(spreadsheetId, tab, rows.length + 1);

  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: `${tab}!A1:Z200000`,
  });

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${tab}!A1`,
    valueInputOption: "RAW",
    requestBody: { values: [header] },
  });

  // Los datasets grandes (p. ej. el directorio de estancos) se escriben en bloques
  // para no superar el tamaño máximo de una petición a la API de Sheets.
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const bloque = rows.slice(i, i + CHUNK_SIZE);
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${tab}!A${i + 2}`,
      valueInputOption: "RAW",
      requestBody: { values: bloque },
    });
  }
}

// Resuelve dónde debe escribirse cada sección: los 5 documentos reales van a
// su propio Google Sheet independiente; Envíos y Técnicos siguen en el libro
// combinado original.
function target(key: SheetsSection): { spreadsheetId: string | undefined; tab: string } {
  if (key === "envios" || key === "tecnicos") {
    return { spreadsheetId: SPREADSHEET_ID, tab: SHEET_NAMES[key] };
  }
  const docKey = key as DocumentKey;
  return { spreadsheetId: getDocumentSpreadsheetId(docKey), tab: DOCUMENTOS[docKey].dataTab };
}

async function syncMateriales() {
  const materiales = await prisma.material.findMany({ include: { tecnico: true }, orderBy: { createdAt: "desc" } });
  const t = target("materiales");
  await writeSheet(
    t.spreadsheetId,
    t.tab,
    ["Código de barras", "Tipo", "Nombre", "Nº serie", "Estado", "Técnico actual", "Zona", "Creado", "Actualizado"],
    materiales.map((m) => [
      m.codigoBarras,
      etiquetaTipo(m),
      m.nombre,
      m.numeroSerie || "",
      ESTADO_MATERIAL_LABELS[m.estado as keyof typeof ESTADO_MATERIAL_LABELS] || m.estado,
      m.tecnico?.name || "",
      m.tecnico?.zona || "",
      m.createdAt.toLocaleString("es-ES"),
      m.updatedAt.toLocaleString("es-ES"),
    ])
  );
}

async function syncEnvios() {
  const envios = await prisma.envio.findMany({
    include: { tecnico: true, creadoPor: true, items: { include: { material: true } } },
    orderBy: { fechaCreacion: "desc" },
  });
  const t = target("envios");
  await writeSheet(
    t.spreadsheetId,
    t.tab,
    [
      "Tipo",
      "Transportista",
      "Origen",
      "Destino",
      "Técnico",
      "Estado",
      "Recurrente",
      "Nº material",
      "Códigos de barras",
      "Creado por",
      "Fecha creación",
      "Fecha enviado",
      "Fecha recibido",
      "Notas",
    ],
    envios.map((e) => [
      e.tipo === "ENVIO" ? "Envío" : "Recogida",
      e.transportista,
      e.origen,
      e.destino,
      e.tecnico?.name || "",
      ESTADO_ENVIO_LABELS[e.estado as keyof typeof ESTADO_ENVIO_LABELS] || e.estado,
      e.esRecurrente ? "Sí" : "No",
      e.items.length,
      e.items.map((i) => i.material.codigoBarras).join(", "),
      e.creadoPor?.name || "",
      e.fechaCreacion.toLocaleString("es-ES"),
      e.fechaEnviado ? e.fechaEnviado.toLocaleString("es-ES") : "",
      e.fechaRecibido ? e.fechaRecibido.toLocaleString("es-ES") : "",
      e.notas || "",
    ])
  );
}

const HEADER_INCIDENCIAS = [
  "Origen",
  "Ticket desk",
  "Título",
  "Tipo",
  "Cliente",
  "Dirección",
  "Técnico",
  "Estado",
  "Material instalado",
  "Nº fotos evidencia",
  "Asignada",
  "En camino",
  "Resuelta",
];

function filaIncidencia(i: {
  origen: string;
  ticketExternoId: string | null;
  titulo: string;
  tipo: string;
  cliente: string | null;
  direccion: string | null;
  tecnico: { name: string } | null;
  estado: string;
  materialesUsados: { material: { codigoBarras: string } }[];
  fotos: unknown[];
  fechaAsignacion: Date | null;
  fechaEnCamino: Date | null;
  fechaResuelta: Date | null;
}): (string | number)[] {
  return [
    i.origen === "DESK" ? "Desk" : "Manual",
    i.ticketExternoId || "",
    i.titulo,
    TIPO_INCIDENCIA_LABELS[i.tipo as keyof typeof TIPO_INCIDENCIA_LABELS] || i.tipo,
    i.cliente || "",
    i.direccion || "",
    i.tecnico?.name || "(sin asignar)",
    ESTADO_INCIDENCIA_LABELS[i.estado as keyof typeof ESTADO_INCIDENCIA_LABELS] || i.estado,
    i.materialesUsados.map((m) => m.material.codigoBarras).join(", "),
    i.fotos.length,
    i.fechaAsignacion ? i.fechaAsignacion.toLocaleString("es-ES") : "",
    i.fechaEnCamino ? i.fechaEnCamino.toLocaleString("es-ES") : "",
    i.fechaResuelta ? i.fechaResuelta.toLocaleString("es-ES") : "",
  ];
}

async function syncIncidencias() {
  const incidencias = await prisma.incidencia.findMany({
    include: { tecnico: true, fotos: true, materialesUsados: { include: { material: true } } },
    orderBy: { fechaImportada: "desc" },
  });
  const t = target("incidencias");
  await writeSheet(t.spreadsheetId, t.tab, HEADER_INCIDENCIAS, incidencias.map(filaIncidencia));
  await syncVistasFiltradasIncidencias(incidencias, t.spreadsheetId);
}

// Réplica de las 9 pestañas de filtro de "Plantilla Informe Incidencias Automatizado"
// (Cambio de router, TFTs, No contestan, Pendiente acción estanquero, TFTs OK,
// SVM*, Datos crudos Importados). Son filtros sobre los mismos datos reales que ya
// sincronizamos — nada inventado. Las 4 variantes "SVM*" se dejan con una nota: la
// app no distingue el formato de hardware SVM/TFT por incidencia, así que fingir esa
// distinción sería mostrar datos incorrectos.
async function syncVistasFiltradasIncidencias(incidencias: Parameters<typeof filaIncidencia>[0][], spreadsheetId: string | undefined) {
  if (!spreadsheetId) return;

  const contiene = (i: (typeof incidencias)[number], ...palabras: string[]) => {
    const texto = `${i.titulo} ${(i as any).descripcion || ""}`.toLowerCase();
    return palabras.some((p) => texto.includes(p));
  };

  const todas = incidencias.map(filaIncidencia);
  const cambioRouter = incidencias.filter((i) => contiene(i, "cambio de router", "router desconfigurado", "router inaccesible")).map(filaIncidencia);
  const noContestan = incidencias.filter((i) => contiene(i, "no contestan", "sin respuesta")).map(filaIncidencia);
  const pendienteEstanquero = incidencias.filter((i) => contiene(i, "pendiente acción estanquero")).map(filaIncidencia);
  const ok = incidencias.filter((i) => i.estado === "RESUELTA").map(filaIncidencia);

  await writeSheet(spreadsheetId, "Datos crudos Importados", HEADER_INCIDENCIAS, todas);
  await writeSheet(spreadsheetId, "Cambio de router", HEADER_INCIDENCIAS, cambioRouter);
  await writeSheet(spreadsheetId, "No contestan", HEADER_INCIDENCIAS, noContestan);
  await writeSheet(spreadsheetId, "Pendiente acción estanquero", HEADER_INCIDENCIAS, pendienteEstanquero);
  await writeSheet(spreadsheetId, "TFTs", HEADER_INCIDENCIAS, todas);
  await writeSheet(spreadsheetId, "TFTs OK", HEADER_INCIDENCIAS, ok);

  const notaSVM = [
    "La app no distingue el formato de hardware (SVM vs TFT) por incidencia, así que esta pestaña se deja " +
      "vacía a propósito en vez de mostrar un dato que podría ser incorrecto.",
  ];
  await writeSheet(spreadsheetId, "SVM", ["Nota"], [notaSVM]);
  await writeSheet(spreadsheetId, "SVM-Pendiente acción estanquero", ["Nota"], [notaSVM]);
  await writeSheet(spreadsheetId, "SVM-No contestan", ["Nota"], [notaSVM]);
  await writeSheet(spreadsheetId, "SVM OK", ["Nota"], [notaSVM]);
}

async function syncTecnicos() {
  const tecnicos = await prisma.user.findMany({
    where: { role: "TECNICO" },
    include: {
      materiales: { where: { estado: "EN_TECNICO" } },
      incidenciasAsig: { where: { estado: { not: "RESUELTA" } } },
    },
    orderBy: { name: "asc" },
  });
  const t = target("tecnicos");
  await writeSheet(
    t.spreadsheetId,
    t.tab,
    [
      "Nombre",
      "Usuario",
      "Email",
      "Zona",
      "Dirección",
      "Teléfono",
      "Persona de contacto",
      "Horario",
      "Cobertura sin coste",
      "Coste km",
      "Material disponible",
      "Incidencias pendientes",
      "Alta",
    ],
    tecnicos.map((tc) => [
      tc.name,
      tc.username,
      tc.email || "",
      tc.zona || "",
      tc.direccion || "",
      tc.phone || "",
      tc.personaContacto || "",
      tc.horario || "",
      tc.radioCobertura || "",
      tc.costeKm || "",
      tc.materiales.length,
      tc.incidenciasAsig.length,
      tc.createdAt.toLocaleString("es-ES"),
    ])
  );
}

// Réplica del log de intervenciones ("Intervenciones 2026 2do Semestre" / hoja "Detalle").
// Columnas que el Excel real trae y nosotros no rastreamos (Hora llamada, Tipo Llamada,
// Empresa subcontratada, Hardware, Emisión, valoración) se dejan en blanco a propósito:
// no inventamos datos que la app no gestiona.
async function syncIntervenciones() {
  const incidencias = await prisma.incidencia.findMany({
    include: { tecnico: true, creadoPor: true, materialesUsados: { include: { material: true } } },
    orderBy: { fechaImportada: "desc" },
  });
  const t = target("intervenciones");
  await writeSheet(
    t.spreadsheetId,
    t.tab,
    [
      "Fecha",
      "Hora llamada",
      "Tipo Llamada",
      "Proyecto",
      "Estanco",
      "Provincia",
      "Admira",
      "Empresa",
      "Tecnico empresa",
      "Tipo Actuación",
      "Estado",
      "Elemento",
      "Tipo de intervención",
      "Hardware",
      "Emisión",
      "Observaciones",
      "Conteo (para dashboard)",
      "valoración",
    ],
    incidencias.map((i) => [
      i.fechaImportada.toLocaleDateString("es-ES"),
      "",
      "",
      i.deskProyecto || i.cliente || "",
      i.cliente || "",
      i.tecnico?.zona || "",
      i.creadoPor?.name || "",
      "",
      i.tecnico?.name || "",
      TIPO_INCIDENCIA_LABELS[i.tipo as keyof typeof TIPO_INCIDENCIA_LABELS] || i.tipo,
      ESTADO_INCIDENCIA_LABELS[i.estado as keyof typeof ESTADO_INCIDENCIA_LABELS] || i.estado,
      i.materialesUsados.map((m) => m.material.codigoBarras).join(", "),
      i.origen === "DESK" ? "Presencial" : "",
      "",
      "",
      i.descripcion || "",
      1,
      "",
    ])
  );
}

// Réplica del censo de instalaciones ("5ª FASE Censo_Total_APP" / hoja "Censo_Pantallas"),
// limitado a incidencias de tipo instalación nueva. Igual que arriba: los campos que el
// Excel real trae y la app no gestiona (fechas de aprobación/prevista, facturación, IMEI,
// datos del comercial…) se dejan en blanco.
async function syncCenso() {
  const instalaciones = await prisma.incidencia.findMany({
    where: { tipo: "INSTALACION_NUEVA" },
    include: { tecnico: true, materialesUsados: { include: { material: true } } },
    orderBy: { fechaImportada: "desc" },
  });
  const t = target("censo");
  await writeSheet(
    t.spreadsheetId,
    t.tab,
    [
      "SR",
      "Fecha Asignación",
      "Estanco",
      "Dirección",
      "Provincia",
      "Estado",
      "Tipo",
      "Fecha de solicitud",
      "Fecha de Intervención",
      "Instalador",
      "Elemento",
      "Nº Serie Router",
      "Nº Serie Pantalla",
      "Información de solicitud",
      "última actualización",
    ],
    instalaciones.map((i) => {
      const router = i.materialesUsados.find((m) => m.material.tipo === "ROUTER")?.material;
      const pantalla = i.materialesUsados.find((m) => m.material.tipo === "PANTALLA")?.material;
      const ultimaActualizacion = i.fechaResuelta || i.fechaEnCamino || i.fechaAsignacion || i.fechaImportada;
      return [
        i.ticketExternoId || "",
        i.fechaAsignacion ? i.fechaAsignacion.toLocaleDateString("es-ES") : "",
        i.cliente || "",
        i.direccion || "",
        i.tecnico?.zona || "",
        ESTADO_INCIDENCIA_LABELS[i.estado as keyof typeof ESTADO_INCIDENCIA_LABELS] || i.estado,
        TIPO_INCIDENCIA_LABELS[i.tipo as keyof typeof TIPO_INCIDENCIA_LABELS] || i.tipo,
        i.fechaImportada.toLocaleDateString("es-ES"),
        i.fechaResuelta ? i.fechaResuelta.toLocaleDateString("es-ES") : "",
        i.tecnico?.name || "",
        i.materialesUsados.map((m) => m.material.codigoBarras).join(", "),
        router?.numeroSerie || router?.codigoBarras || "",
        pantalla?.numeroSerie || pantalla?.codigoBarras || "",
        i.descripcion || "",
        ultimaActualizacion.toLocaleString("es-ES"),
      ];
    })
  );
}

// Directorio maestro de estancos ("Universo Comerciales Agosto 2026" / hoja "BBDD ESTANCOS"),
// importado desde el Excel real (ver scripts/import-estancos.ts). Son 13.598 filas, así que
// reescribirlo entero en cada acción de la app sería un desperdicio: se sincroniza solo, sin
// que nadie tenga que darle a ningún botón, pero como mucho una vez cada 20 minutos. El botón
// manual (force=true) se salta ese límite para forzar una sincronización inmediata.
let lastEstancosSyncAt = 0;
const ESTANCOS_MIN_INTERVAL_MS = 20 * 60 * 1000;

async function syncEstancos(force = false) {
  const now = Date.now();
  if (!force && now - lastEstancosSyncAt < ESTANCOS_MIN_INTERVAL_MS) return;
  lastEstancosSyncAt = now;

  const estancos = await prisma.estanco.findMany({ orderBy: { idEstanco: "asc" } });
  const t = target("estancos");
  await writeSheet(
    t.spreadsheetId,
    t.tab,
    [
      "ID Estanco",
      "Nombre Estanco",
      "Dirección estanco",
      "Municipio",
      "Codigo Postal",
      "Provincia",
      "Teléfono Estanco",
      "Zona",
      "Frecuencia",
      "Segmento",
      "Comercial",
      "Teléfono Comercial",
      "Comentario Comercial",
      "Correo Comercial",
    ],
    estancos.map((e) => [
      e.idEstanco,
      e.nombre,
      e.direccion || "",
      e.municipio || "",
      e.codigoPostal || "",
      e.provincia || "",
      e.telefono || "",
      e.zona || "",
      e.frecuencia || "",
      e.segmento || "",
      e.comercial || "",
      e.telefonoComercial || "",
      e.comentarioComercial || "",
      e.correoComercial || "",
    ])
  );
}

const SYNCERS = {
  materiales: syncMateriales,
  envios: syncEnvios,
  incidencias: syncIncidencias,
  tecnicos: syncTecnicos,
  intervenciones: syncIntervenciones,
  censo: syncCenso,
  estancos: syncEstancos,
} as const;

export type SheetsSection = keyof typeof SYNCERS;

/**
 * Sincroniza una o varias secciones. Cada una comprueba por sí misma si su
 * Google Sheet de destino está configurado; si no lo está, no hace nada.
 * `forceEstancos` salta el límite de frecuencia del directorio de estancos
 * (lo usa el botón manual "Sincronizar ahora").
 */
export async function syncToSheets(sections: SheetsSection | SheetsSection[], opts?: { forceEstancos?: boolean }) {
  const sheets = getClient();
  if (!sheets) return;
  const list = Array.isArray(sections) ? sections : [sections];
  await Promise.all(
    list.map(async (s) => {
      try {
        if (s === "estancos") await syncEstancos(opts?.forceEstancos);
        else await SYNCERS[s]();
      } catch (err) {
        console.error(`[google-sheets] Error sincronizando "${s}":`, err);
      }
    })
  );
}

/**
 * Devuelve, por cada pestaña ya creada en el libro combinado (Envíos, Técnicos),
 * un enlace directo a esa pestaña concreta (con #gid=...).
 */
export async function getSheetTabLinks(): Promise<Record<string, string> | null> {
  const sheets = getClient();
  if (!sheets || !SPREADSHEET_ID) return null;

  await ensureTabsExist(SPREADSHEET_ID, Object.values(SHEET_NAMES));
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const links: Record<string, string> = {};
  for (const s of meta.data.sheets || []) {
    const title = s.properties?.title;
    const gid = s.properties?.sheetId;
    if (title && gid !== undefined && gid !== null) {
      links[title] = `${SHEETS_URL}#gid=${gid}`;
    }
  }
  return links;
}

/** Enlace directo a cada uno de los 5 documentos reales (cada uno su propio Google Sheet). */
export function getDocumentUrls(): Record<DocumentKey, string | null> {
  return {
    materiales: getDocumentUrl("materiales"),
    incidencias: getDocumentUrl("incidencias"),
    intervenciones: getDocumentUrl("intervenciones"),
    censo: getDocumentUrl("censo"),
    estancos: getDocumentUrl("estancos"),
  };
}

export { SHEET_NAMES, DOCUMENT_KEYS };
