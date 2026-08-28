import ExcelJS from "exceljs";
import { Readable } from "stream";
import { getDriveClient } from "./googleSheets";

/**
 * Guarda en Drive, y mantiene actualizado, el propio Excel semanal de
 * instalaciones que manda el cliente — es el documento que el equipo revisa
 * para decidir viabilidad, no uno nuevo (ver plan de la sesión). Se le
 * añaden columnas de viabilidad al final de las que ya trae, y se van
 * rellenando fila a fila conforme responde cada comercial.
 */

const CARPETA_ID = process.env.GOOGLE_DRIVE_INSTALACIONES_CARPETA_ID;

// Columnas que añade la app al final de las que ya trae el Excel del
// cliente (SR, COD HOST, EXPENDEDURIA, MOBILIARIO, STATUS ADICIONAL...).
// Se escriben siempre en estas mismas posiciones fijas, sea cual sea el
// ancho real de cada Excel semanal — así no hace falta detectar "la próxima
// columna libre" (distinto en cada archivo) y nunca se pisa una columna del
// cliente aunque algún envío traiga más o menos columnas de las habituales.
const COLUMNA_INICIO = 20; // columna T (0-index 19 = T, empezamos en 20 = U) — deja margen de sobra sobre las ~12 columnas que trae el Excel real hoy
const VIABILIDAD_COLUMNAS = {
  materialConfirmado: COLUMNA_INICIO,
  materialCorreccion: COLUMNA_INICIO + 1,
  tipoUbicacion: COLUMNA_INICIO + 2,
  medidas: COLUMNA_INICIO + 3,
  puntosElectricos: COLUMNA_INICIO + 4,
  sePuedeTaladrar: COLUMNA_INICIO + 5,
  comentarios: COLUMNA_INICIO + 6,
  respondidoPor: COLUMNA_INICIO + 7,
  fechaRespuesta: COLUMNA_INICIO + 8,
  estadoViabilidad: COLUMNA_INICIO + 9,
} as const;

const VIABILIDAD_CABECERAS: Record<keyof typeof VIABILIDAD_COLUMNAS, string> = {
  materialConfirmado: "VIABILIDAD - Material confirmado",
  materialCorreccion: "VIABILIDAD - Corrección material",
  tipoUbicacion: "VIABILIDAD - Hueco/Pared",
  medidas: "VIABILIDAD - Medidas hueco",
  puntosElectricos: "VIABILIDAD - Puntos eléctricos cercanos",
  sePuedeTaladrar: "VIABILIDAD - Se puede taladrar",
  comentarios: "VIABILIDAD - Comentarios",
  respondidoPor: "VIABILIDAD - Respondido por",
  fechaRespuesta: "VIABILIDAD - Fecha respuesta",
  estadoViabilidad: "VIABILIDAD - Estado",
};

/**
 * Sube el Excel semanal recién importado a la carpeta de Drive dedicada, con
 * la cabecera de columnas de viabilidad ya añadida (todavía vacías). Se
 * llama una sola vez por cada importación, con el mismo buffer que se acaba
 * de parsear. Devuelve el `fileId` de Drive, o `null` si no hay carpeta
 * configurada (la app sigue funcionando sin el guardado en Drive, solo sin
 * esta parte del flujo).
 */
export async function guardarExcelSemanalEnDrive(buffer: Buffer, nombreOriginal: string): Promise<string | null> {
  const drive = getDriveClient();
  if (!drive || !CARPETA_ID) {
    console.warn("[viabilidad-excel] GOOGLE_DRIVE_INSTALACIONES_CARPETA_ID no configurado: no se guarda el Excel en Drive.");
    return null;
  }

  const wb = new ExcelJS.Workbook();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- desajuste de tipos entre exceljs y Buffer de Node
  await wb.xlsx.load(buffer as any);
  const ws = wb.worksheets[0];
  if (ws) {
    const cabecera = ws.getRow(1);
    for (const [, col] of Object.entries(VIABILIDAD_COLUMNAS)) {
      const clave = Object.keys(VIABILIDAD_COLUMNAS).find(
        (k) => VIABILIDAD_COLUMNAS[k as keyof typeof VIABILIDAD_COLUMNAS] === col
      ) as keyof typeof VIABILIDAD_COLUMNAS;
      cabecera.getCell(col + 1).value = VIABILIDAD_CABECERAS[clave];
    }
    cabecera.commit();
  }
  const salida = await wb.xlsx.writeBuffer();

  const fecha = new Date().toISOString().slice(0, 10);
  const nombre = `Instalaciones ${fecha} — ${nombreOriginal}`;
  const res = await drive.files.create({
    requestBody: {
      name: nombre,
      parents: [CARPETA_ID],
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    },
    media: {
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      body: Readable.from(Buffer.from(salida)),
    },
    fields: "id",
  });

  console.log(`[viabilidad-excel] Excel semanal guardado en Drive: ${nombre} (${res.data.id})`);
  return res.data.id || null;
}

/**
 * Reabre el Excel semanal ya guardado y escribe la respuesta de viabilidad
 * en la fila indicada (la misma que ocupaba esa instalación al importar el
 * Excel — ver Incidencia.viabilidadExcelFila). No bloqueante: quien la llama
 * debe envolverla en try/catch, un fallo aquí no debe romper el flujo real
 * de guardar la respuesta del comercial en la base de datos.
 */
export async function actualizarFilaViabilidadEnExcel(
  fileId: string,
  fila: number,
  datos: {
    materialConfirmado: boolean;
    materialCorreccion?: string | null;
    tipoUbicacion: string;
    medidas?: string | null;
    puntosElectricosCercanos: boolean;
    puntosElectricosComentario?: string | null;
    sePuedeTaladrar: boolean;
    comentarios?: string | null;
    respondidoPorNombre?: string | null;
    fechaRespuesta: Date;
    estadoViabilidad?: string;
  }
): Promise<void> {
  const drive = getDriveClient();
  if (!drive) return;

  const descarga = await drive.files.get({ fileId, alt: "media" }, { responseType: "arraybuffer" });
  const wb = new ExcelJS.Workbook();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- desajuste de tipos entre exceljs y Buffer de Node
  await wb.xlsx.load(Buffer.from(descarga.data as ArrayBuffer) as any);
  const ws = wb.worksheets[0];
  if (!ws) return;

  const filaExcel = ws.getRow(fila);
  filaExcel.getCell(VIABILIDAD_COLUMNAS.materialConfirmado + 1).value = datos.materialConfirmado ? "Sí" : "No";
  filaExcel.getCell(VIABILIDAD_COLUMNAS.materialCorreccion + 1).value = datos.materialCorreccion || "";
  filaExcel.getCell(VIABILIDAD_COLUMNAS.tipoUbicacion + 1).value = datos.tipoUbicacion;
  filaExcel.getCell(VIABILIDAD_COLUMNAS.medidas + 1).value = datos.medidas || "";
  filaExcel.getCell(VIABILIDAD_COLUMNAS.puntosElectricos + 1).value = datos.puntosElectricosCercanos
    ? `Sí${datos.puntosElectricosComentario ? ` — ${datos.puntosElectricosComentario}` : ""}`
    : "No";
  filaExcel.getCell(VIABILIDAD_COLUMNAS.sePuedeTaladrar + 1).value = datos.sePuedeTaladrar ? "Sí" : "No";
  filaExcel.getCell(VIABILIDAD_COLUMNAS.comentarios + 1).value = datos.comentarios || "";
  filaExcel.getCell(VIABILIDAD_COLUMNAS.respondidoPor + 1).value = datos.respondidoPorNombre || "";
  filaExcel.getCell(VIABILIDAD_COLUMNAS.fechaRespuesta + 1).value = datos.fechaRespuesta;
  if (datos.estadoViabilidad) {
    filaExcel.getCell(VIABILIDAD_COLUMNAS.estadoViabilidad + 1).value = datos.estadoViabilidad;
  }
  filaExcel.commit();

  const salida = await wb.xlsx.writeBuffer();
  await drive.files.update({
    fileId,
    media: {
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      body: Readable.from(Buffer.from(salida)),
    },
  });
}
