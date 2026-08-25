import { google } from "googleapis";
import ExcelJS from "exceljs";
import { Readable } from "stream";
import { prisma } from "./prisma";
import {
  ESTADO_ENVIO_LABELS,
  ESTADO_INCIDENCIA_LABELS,
  TIPO_INCIDENCIA_LABELS,
  PROYECTO_LABELS,
} from "./constants";
import { DOCUMENTOS, DocumentKey, getDocumentSpreadsheetId, getDocumentUrl } from "./documentSheets";
import { etiquetaOrigenIncidencia } from "./materialLabel";

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

// Solo lo necesita "materiales" (STOCK): es un .xlsx real subido a Drive, no
// una Hoja de Google nativa, así que no vale la API de Sheets — hay que
// descargar/subir el archivo entero con la API de Drive.
let driveClient: ReturnType<typeof google.drive> | null = null;

function getDriveClient() {
  if (!CLIENT_EMAIL || !PRIVATE_KEY) return null;
  if (driveClient) return driveClient;

  const auth = new google.auth.JWT({
    email: CLIENT_EMAIL,
    key: PRIVATE_KEY,
    scopes: ["https://www.googleapis.com/auth/drive"],
  });

  driveClient = google.drive({ version: "v3", auth });
  return driveClient;
}

// --- Utilidades genéricas, parametrizadas por spreadsheetId ---------------

// Clave `${spreadsheetId}:${tab}` — OJO: antes se guardaba solo el
// spreadsheetId, así que en cuanto se comprobaba UNA pestaña de un documento,
// cualquier OTRA pestaña nueva de ese mismo documento dejaba de comprobarse
// (nunca llegaba a crearse) durante el resto de vida del proceso. Con los
// documentos reales, que no tienen pre-creadas todas las pestañas que el
// código espera, eso hacía fallar la escritura con "Unable to parse range".
const ensuredTabsCache = new Set<string>();
// Serializa las comprobaciones por documento para no crear la misma pestaña
// dos veces si llegan varias llamadas en paralelo.
const ensureTabsPromises = new Map<string, Promise<void>>();

async function ensureTabsExist(spreadsheetId: string, tabNames: string[]) {
  const sheets = getClient();
  if (!sheets) return;

  const pendientes = tabNames.filter((t) => !ensuredTabsCache.has(`${spreadsheetId}:${t}`));
  if (pendientes.length === 0) return;

  const anterior = ensureTabsPromises.get(spreadsheetId) || Promise.resolve();
  const promise = anterior.catch(() => {}).then(async () => {
    const aunPendientes = pendientes.filter((t) => !ensuredTabsCache.has(`${spreadsheetId}:${t}`));
    if (aunPendientes.length === 0) return;

    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    const existentes = new Set((meta.data.sheets || []).map((s) => s.properties?.title));

    const faltan = aunPendientes.filter((t) => !existentes.has(t));
    if (faltan.length > 0) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: { requests: faltan.map((title) => ({ addSheet: { properties: { title } } })) },
      });
    }
    for (const t of aunPendientes) ensuredTabsCache.add(`${spreadsheetId}:${t}`);
  });
  ensureTabsPromises.set(spreadsheetId, promise);

  await promise;
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

// "STOCK PANTALLAS FASE 5 AGOSTO 2026" es un .xlsx real subido a Drive (no una
// Hoja de Google nativa): no se puede escribir celda a celda con la API de
// Sheets, hay que descargar el archivo entero, editar solo lo que la app
// gestiona con ExcelJS, y volver a subirlo completo con la API de Drive. Por
// el coste de esa operación (archivo de ~3MB, 20 pestañas) se limita a como
// mucho una vez cada 20 minutos, igual que "estancos"; el botón manual la
// salta. Solo se tocan filas YA EXISTENTES en la pestaña "STOCK", localizadas
// por "*SERIAL NUMBER" (columna B) — nunca se añaden filas nuevas, porque la
// app no tiene datos de EMISOR/MARCA/Modelo para crear una fila con sentido.
// El resto de columnas de esa pestaña y las otras 19 pestañas del archivo
// quedan intactas (comprobado: una ida-vuelta con ExcelJS sin cambios
// reproduce el archivo con las mismas ~82.000 validaciones, fórmulas,
// colores y valores — solo cambia metadata interna irrelevante).
let lastMaterialesSyncAt = 0;
const MATERIALES_MIN_INTERVAL_MS = 20 * 60 * 1000;

const STOCK_COLUMNAS = {
  serie: 2, // *SERIAL NUMBER
  instalada: 7, // *INSTALADA
  estancoActual: 8, // *Estanco Actual
  tecnico: 9, // *TECNICO
  proyecto: 10, // *PROYECTO
  provinciaTecnico: 11, // *Provincia Técnico
  actualizacionTecnico: 12, // Actualización técnico
} as const;

async function syncMateriales(force = false) {
  const now = Date.now();
  if (!force && now - lastMaterialesSyncAt < MATERIALES_MIN_INTERVAL_MS) return;
  lastMaterialesSyncAt = now;

  const drive = getDriveClient();
  const fileId = getDocumentSpreadsheetId("materiales");
  if (!drive || !fileId) return;

  const materiales = await prisma.material.findMany({ include: { tecnico: true, estancoInstalado: true } });
  if (materiales.length === 0) return;
  const porSerie = new Map(materiales.map((m) => [m.numeroSerie.trim(), m]));

  const descarga = await drive.files.get({ fileId, alt: "media" }, { responseType: "arraybuffer" });
  const wb = new ExcelJS.Workbook();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- desajuste de tipos entre exceljs y los tipos de Buffer de Node
  await wb.xlsx.load(Buffer.from(descarga.data as ArrayBuffer) as any);
  const ws = wb.getWorksheet("STOCK");
  if (!ws) return;

  let actualizados = 0;
  for (let r = 2; r <= ws.rowCount; r++) {
    const fila = ws.getRow(r);
    const serie = fila.getCell(STOCK_COLUMNAS.serie).value;
    if (!serie) continue;
    const m = porSerie.get(String(serie).trim());
    if (!m) continue;

    fila.getCell(STOCK_COLUMNAS.instalada).value = m.estado === "INSTALADO" ? "SI" : "";
    fila.getCell(STOCK_COLUMNAS.estancoActual).value = m.estancoInstalado?.nombre || "";
    fila.getCell(STOCK_COLUMNAS.tecnico).value = m.tecnico?.name || "";
    fila.getCell(STOCK_COLUMNAS.proyecto).value = m.proyecto
      ? PROYECTO_LABELS[m.proyecto as keyof typeof PROYECTO_LABELS] || m.proyecto
      : "";
    fila.getCell(STOCK_COLUMNAS.provinciaTecnico).value = m.tecnico?.zona || "";
    fila.getCell(STOCK_COLUMNAS.actualizacionTecnico).value = m.updatedAt;
    actualizados++;
  }

  if (actualizados === 0) return; // ningún número de serie coincidía; no hace falta volver a subir el archivo

  const outBuffer = await wb.xlsx.writeBuffer();
  await drive.files.update({
    fileId,
    media: {
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      body: Readable.from(Buffer.from(outBuffer)),
    },
  });
  console.log(`[google-sheets] STOCK actualizado: ${actualizados} de ${materiales.length} materiales localizados por número de serie.`);
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
      "Números de serie",
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
      e.items.map((i) => i.material.numeroSerie).join(", "),
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
  "Proyecto",
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
  proyecto: string | null;
  cliente: string | null;
  direccion: string | null;
  tecnico: { name: string } | null;
  estado: string;
  materialesUsados: { material: { numeroSerie: string } }[];
  fotos: unknown[];
  fechaAsignacion: Date | null;
  fechaEnCamino: Date | null;
  fechaResuelta: Date | null;
}): (string | number)[] {
  return [
    etiquetaOrigenIncidencia(i.origen),
    i.ticketExternoId || "",
    i.titulo,
    TIPO_INCIDENCIA_LABELS[i.tipo as keyof typeof TIPO_INCIDENCIA_LABELS] || i.tipo,
    i.proyecto ? PROYECTO_LABELS[i.proyecto as keyof typeof PROYECTO_LABELS] || i.proyecto : "",
    i.cliente || "",
    i.direccion || "",
    i.tecnico?.name || "(sin asignar)",
    ESTADO_INCIDENCIA_LABELS[i.estado as keyof typeof ESTADO_INCIDENCIA_LABELS] || i.estado,
    i.materialesUsados.map((m) => m.material.numeroSerie).join(", "),
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
  // DESACTIVADO: "Plantilla Informe Incidencias Automatizado" es el documento
  // REAL del equipo, y sus pestañas "No contestan", "Pendiente acción
  // estanquero", "TFTs", "TFTs OK", "SVM"* ya tienen contenido real propio
  // (listas de estancos con seguimiento manual, o resúmenes con fórmulas) que
  // NO tiene nada que ver con esta vista filtrada de incidencias — escribir
  // ahí sobrescribía y destruía ese contenido real. Esta función solo debe
  // volver a activarse si se rediseña para escribir en pestañas propias de la
  // app, no en las que ya usa el equipo con otro propósito.
  // await syncVistasFiltradasIncidencias(incidencias, t.spreadsheetId);
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

  // Cada pestaña se escribe de forma independiente: si una falla (p. ej.
  // "Datos crudos Importados" está protegida en el documento real y el
  // servicio no tiene permiso para editarla), las demás no deben quedarse
  // sin sincronizar por ese motivo.
  const tandas: [string, (string | number)[][]][] = [
    ["Datos crudos Importados", todas],
    ["Cambio de router", cambioRouter],
    ["No contestan", noContestan],
    ["Pendiente acción estanquero", pendienteEstanquero],
    ["TFTs", todas],
    ["TFTs OK", ok],
  ];
  for (const [tab, filas] of tandas) {
    try {
      await writeSheet(spreadsheetId, tab, HEADER_INCIDENCIAS, filas);
    } catch (err) {
      console.error(`[google-sheets] Error sincronizando la pestaña "${tab}":`, err);
    }
  }

  const notaSVM = [
    "La app no distingue el formato de hardware (SVM vs TFT) por incidencia, así que esta pestaña se deja " +
      "vacía a propósito en vez de mostrar un dato que podría ser incorrecto.",
  ];
  for (const tab of ["SVM", "SVM-Pendiente acción estanquero", "SVM-No contestan", "SVM OK"]) {
    try {
      await writeSheet(spreadsheetId, tab, ["Nota"], [notaSVM]);
    } catch (err) {
      console.error(`[google-sheets] Error sincronizando la pestaña "${tab}":`, err);
    }
  }
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
      i.materialesUsados.map((m) => m.material.numeroSerie).join(", "),
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
// Convierte un índice de columna (0 = A) a su letra en notación A1,
// incluyendo columnas de dos letras (26 = AA, 27 = AB...).
function columnaALetra(indice0: number): string {
  let n = indice0 + 1;
  let letra = "";
  while (n > 0) {
    const resto = (n - 1) % 26;
    letra = String.fromCharCode(65 + resto) + letra;
    n = Math.floor((n - 1) / 26);
  }
  return letra;
}

// "Censo_Pantallas" es el documento real con el histórico de instalaciones
// (~2.700 filas), con columnas (Frecuencia, ID, Facturación, Pulgadas, IMEI,
// Nºserie SIM/MiniPC, Seguimiento Admira, datos del comercial...) que la app
// no gestiona y no debe tocar. A diferencia del resto de secciones, aquí NO
// se reescribe la pestaña entera: se localiza cada instalación por su "SR"
// (columna B, coincide con Incidencia.ticketExternoId) y solo se actualizan,
// celda a celda, las columnas que la app conoce con certeza; el resto de la
// fila queda intacto. Las instalaciones que aún no estén en la hoja se
// añaden al final, con solo esas columnas rellenas y el resto en blanco.
const CENSO_TOTAL_COLUMNAS = 40; // A..AN, según la hoja real
const CENSO_COLUMNAS_APP = {
  sr: 1, // B
  fechaAsignacion: 2, // C
  estanco: 4, // E
  direccion: 5, // F
  codigoPostal: 6, // G
  provincia: 7, // H
  estado: 8, // I
  tipo: 9, // J
  fechaSolicitud: 10, // K
  fechaIntervencion: 13, // N
  instalador: 14, // O
  serieRouter: 20, // U
  seriePantalla: 22, // W
  informacionSolicitud: 27, // AB
  ultimaActualizacion: 29, // AD
} as const;

async function syncCenso() {
  const sheets = getClient();
  const t = target("censo");
  if (!sheets || !t.spreadsheetId) return;

  const instalaciones = await prisma.incidencia.findMany({
    where: { tipo: "INSTALACION_NUEVA", ticketExternoId: { not: null } },
    include: { tecnico: true, estanco: true, materialesUsados: { include: { material: true } } },
    orderBy: { fechaImportada: "desc" },
  });
  if (instalaciones.length === 0) return; // nada que sincronizar todavía

  await ensureTabsExist(t.spreadsheetId, [t.tab]);

  // Localizar la fila de cada SR ya presente en la hoja (columna B desde la fila 4;
  // las 3 primeras filas son cabecera/rótulo de sección).
  const colSR = columnaALetra(CENSO_COLUMNAS_APP.sr);
  const existentes = await sheets.spreadsheets.values.get({
    spreadsheetId: t.spreadsheetId,
    range: `${t.tab}!${colSR}4:${colSR}`,
  });
  const filaPorSR = new Map<string, number>(); // SR -> nº de fila (1-based)
  (existentes.data.values || []).forEach((fila, i) => {
    const sr = fila[0];
    if (sr) filaPorSR.set(String(sr).trim(), i + 4);
  });

  const dataUpdates: { range: string; values: (string | number)[][] }[] = [];
  const filasNuevas: (string | number)[][] = [];

  for (const i of instalaciones) {
    const sr = i.ticketExternoId!.trim();
    const router = i.materialesUsados.find((m) => m.material.tipo === "ROUTER")?.material;
    const pantalla = i.materialesUsados.find((m) => m.material.tipo === "PANTALLA")?.material;
    const ultimaActualizacion = i.fechaResuelta || i.fechaEnCamino || i.fechaAsignacion || i.fechaImportada;

    const valores: Partial<Record<number, string>> = {
      [CENSO_COLUMNAS_APP.fechaAsignacion]: i.fechaAsignacion ? i.fechaAsignacion.toLocaleDateString("es-ES") : "",
      [CENSO_COLUMNAS_APP.estanco]: i.estanco?.nombre || i.cliente || "",
      [CENSO_COLUMNAS_APP.direccion]: i.estanco?.direccion || i.direccion || "",
      [CENSO_COLUMNAS_APP.codigoPostal]: i.estanco?.codigoPostal || "",
      [CENSO_COLUMNAS_APP.provincia]: i.estanco?.provincia || "",
      [CENSO_COLUMNAS_APP.estado]: ESTADO_INCIDENCIA_LABELS[i.estado as keyof typeof ESTADO_INCIDENCIA_LABELS] || i.estado,
      [CENSO_COLUMNAS_APP.tipo]: TIPO_INCIDENCIA_LABELS[i.tipo as keyof typeof TIPO_INCIDENCIA_LABELS] || i.tipo,
      [CENSO_COLUMNAS_APP.fechaSolicitud]: i.fechaImportada.toLocaleDateString("es-ES"),
      [CENSO_COLUMNAS_APP.fechaIntervencion]: i.fechaResuelta ? i.fechaResuelta.toLocaleDateString("es-ES") : "",
      [CENSO_COLUMNAS_APP.instalador]: i.tecnico?.name || "",
      [CENSO_COLUMNAS_APP.serieRouter]: router?.numeroSerie || "",
      [CENSO_COLUMNAS_APP.seriePantalla]: pantalla?.numeroSerie || "",
      [CENSO_COLUMNAS_APP.informacionSolicitud]: i.descripcion || "",
      [CENSO_COLUMNAS_APP.ultimaActualizacion]: ultimaActualizacion.toLocaleString("es-ES"),
    };

    const filaExistente = filaPorSR.get(sr);
    if (filaExistente) {
      for (const [indice, valor] of Object.entries(valores)) {
        dataUpdates.push({ range: `${t.tab}!${columnaALetra(Number(indice))}${filaExistente}`, values: [[valor as string]] });
      }
    } else {
      const fila: string[] = new Array(CENSO_TOTAL_COLUMNAS).fill("");
      fila[CENSO_COLUMNAS_APP.sr] = sr;
      for (const [indice, valor] of Object.entries(valores)) fila[Number(indice)] = valor as string;
      filasNuevas.push(fila);
    }
  }

  // Las actualizaciones celda a celda se agrupan en una sola petición (por
  // tandas, para no superar el tamaño máximo admitido por la API).
  for (let i = 0; i < dataUpdates.length; i += 400) {
    const tanda = dataUpdates.slice(i, i + 400);
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: t.spreadsheetId,
      requestBody: { valueInputOption: "RAW", data: tanda },
    });
  }

  if (filasNuevas.length > 0) {
    await sheets.spreadsheets.values.append({
      spreadsheetId: t.spreadsheetId,
      range: `${t.tab}!A1:AN1`,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: filasNuevas },
    });
  }
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
export async function syncToSheets(
  sections: SheetsSection | SheetsSection[],
  opts?: { forceEstancos?: boolean; forceMateriales?: boolean }
) {
  const sheets = getClient();
  if (!sheets) return;
  const list = Array.isArray(sections) ? sections : [sections];
  await Promise.all(
    list.map(async (s) => {
      try {
        if (s === "estancos") await syncEstancos(opts?.forceEstancos);
        else if (s === "materiales") await syncMateriales(opts?.forceMateriales);
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
