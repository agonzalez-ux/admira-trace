/**
 * Utilidades para importar datos desde archivos Excel.
 * Maneja parsing, validación y transformación de datos.
 */

import ExcelJS from "exceljs";

/**
 * Lee una celda por nombre de columna (no por índice fijo, porque el orden de
 * columnas puede variar entre Excels). Si la columna no existe en este
 * archivo concreto, devuelve null en vez de intentar `row.getCell(0)`, que
 * lanza una excepción ("0 is out of bounds") y tiraría abajo la fila entera
 * (o, si el patrón se repite en todas las filas, la importación completa).
 */
function celda(row: ExcelJS.Row, headers: Map<string, number>, columna: string): ExcelJS.CellValue | null {
  const col = headers.get(columna);
  if (col === undefined) return null;
  return row.getCell(col).value;
}

/** Como `celda`, pero como texto ya recortado (o null si está vacía / no existe la columna). */
function celdaTexto(row: ExcelJS.Row, headers: Map<string, number>, columna: string): string | null {
  return celda(row, headers, columna)?.toString().trim() || null;
}

/**
 * Estructura de una fila del Excel ASIGNACIONES_AGO26.
 */
export interface FilaAsignaciones {
  idEstanco: string;
  nombre: string;
  zona: string | null;
  provincia: string | null;
  codigoPostal: string | null;
  municipio: string | null;
  comercial: string | null;
  correoComercial: string | null;
  telefonoComercial: string | null;
  frecuencia: string | null;
  segmento: string | null;
}

/**
 * Estructura de una fila del Excel LIBRO4 (instalaciones).
 */
export interface FilaInstalacion {
  sr: string;
  codHost: string;
  expendeduria: string;
  mobiliario: string;
  statusAdicional: string | null;
  fechaCreacion: Date | null;
  fechaPrevista: Date | null;
  fechaFinalizacion: Date | null;
  provincia: string | null;
  asignacionActual: string | null;
  comentarios: string | null;
}

/**
 * Parsea el Excel de ASIGNACIONES_AGO26 (directorio de comerciales).
 * Retorna las filas parseadas y los errores encontrados.
 */
export async function parseExcelAsignaciones(archivo: File): Promise<{
  filas: FilaAsignaciones[];
  errores: string[];
}> {
  const filas: FilaAsignaciones[] = [];
  const errores: string[] = [];

  try {
    const buffer = await archivo.arrayBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);

    // Buscar la hoja "BBDD_AGO26"
    const sheet = workbook.getWorksheet("BBDD_AGO26");
    if (!sheet) {
      errores.push('No se encontró la hoja "BBDD_AGO26" en el Excel');
      return { filas, errores };
    }

    // Mapeo de columnas por nombre (primera fila es cabecera)
    const headers = new Map<string, number>();
    const headerRow = sheet.getRow(1);

    headerRow.eachCell((cell, colNumber) => {
      const cellValue = cell.value?.toString().trim().toUpperCase() || "";
      headers.set(cellValue, colNumber);
    });

    // Validar que existan las columnas obligatorias
    if (!headers.has("CLT.ESTANCO ID") || !headers.has("CLT.ESTANCO NOMBRE")) {
      errores.push(
        'Faltan columnas obligatorias: debe incluir "CLT.Estanco ID" y "CLT.Estanco NOMBRE"'
      );
      return { filas, errores };
    }

    // Procesar filas de datos (comenzar desde fila 2)
    let numFila = 2;
    for (let i = 2; i <= sheet.rowCount; i++) {
      const row = sheet.getRow(i);
      if (!row.values || row.values.length === 0) break;

      try {
        const idEstanco = row.getCell(headers.get("CLT.ESTANCO ID")!).value?.toString().trim();
        const nombre = row.getCell(headers.get("CLT.ESTANCO NOMBRE")!).value?.toString().trim();

        if (!idEstanco || !nombre) {
          errores.push(`Fila ${i}: CLT.Estanco ID o NOMBRE vacío`);
          continue;
        }

        const fila: FilaAsignaciones = {
          idEstanco,
          nombre,
          zona: celdaTexto(row, headers, "CLT.GEO.RTC"),
          provincia: celdaTexto(row, headers, "CLT.GEO.PROVINCIA"),
          codigoPostal: celdaTexto(row, headers, "CLT.GEO.CODIGO.POSTAL"),
          municipio: celdaTexto(row, headers, "CLT.GEO.MUNICIPIO"),
          comercial: celdaTexto(row, headers, "FFVV.RESPONSABLE FULLNAME"),
          correoComercial: celdaTexto(row, headers, "COMERCIAL_MAIL"),
          telefonoComercial: celdaTexto(row, headers, "COMERCIAL_TFNO"),
          frecuencia: celdaTexto(row, headers, "CLT.FRECUENCIA.VISITA"),
          segmento: celdaTexto(row, headers, "CLT.SEGMENTO.ITG"),
        };

        filas.push(fila);
      } catch (err) {
        errores.push(`Fila ${i}: Error parseando: ${err instanceof Error ? err.message : "desconocido"}`);
      }

      numFila++;
    }

    console.log(
      `[excel-import] Parseadas ${filas.length} filas de ASIGNACIONES con ${errores.length} errores`
    );
  } catch (err) {
    errores.push(
      "Error leyendo el archivo Excel: " + (err instanceof Error ? err.message : "desconocido")
    );
  }

  return { filas, errores };
}

/**
 * Parsea el Excel de LIBRO4 (instalaciones semanales).
 * Retorna las filas parseadas y los errores encontrados.
 */
export async function parseExcelInstalaciones(archivo: File): Promise<{
  filas: FilaInstalacion[];
  errores: string[];
}> {
  const filas: FilaInstalacion[] = [];
  const errores: string[] = [];

  try {
    const buffer = await archivo.arrayBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);

    // Buscar la hoja "Hoja1"
    const sheet = workbook.getWorksheet("Hoja1");
    if (!sheet) {
      errores.push('No se encontró la hoja "Hoja1" en el Excel');
      return { filas, errores };
    }

    // Mapeo de columnas por nombre
    const headers = new Map<string, number>();
    const headerRow = sheet.getRow(1);

    headerRow.eachCell((cell, colNumber) => {
      const cellValue = cell.value?.toString().trim().toUpperCase() || "";
      headers.set(cellValue, colNumber);
    });

    // Validar columnas obligatorias
    if (!headers.has("SR") || !headers.has("COD HOST") || !headers.has("EXPENDEDURIA")) {
      errores.push(
        'Faltan columnas obligatorias: debe incluir "SR", "COD HOST" y "EXPENDEDURIA"'
      );
      return { filas, errores };
    }

    // Procesar filas
    for (let i = 2; i <= sheet.rowCount; i++) {
      const row = sheet.getRow(i);
      if (!row.values || row.values.length === 0) break;

      try {
        const sr = row.getCell(headers.get("SR")!).value?.toString().trim();
        const codHost = row.getCell(headers.get("COD HOST")!).value?.toString().trim();
        const expendeduria = row
          .getCell(headers.get("EXPENDEDURIA")!)
          .value?.toString()
          .trim();

        if (!sr || !codHost || !expendeduria) {
          errores.push(`Fila ${i}: SR, COD HOST o EXPENDEDURIA vacío`);
          continue;
        }

        // Parsear fechas (Excel guarda como número serial)
        const parseFecha = (val: any): Date | null => {
          if (!val) return null;
          if (val instanceof Date) return val;
          const numVal = Number(val);
          if (isNaN(numVal)) return null;
          // Excel epoch: 1899-12-30
          const excelEpoch = new Date(1899, 11, 30);
          return new Date(excelEpoch.getTime() + numVal * 24 * 60 * 60 * 1000);
        };

        const fila: FilaInstalacion = {
          sr,
          codHost,
          expendeduria,
          mobiliario: celdaTexto(row, headers, "MOBILIARIO") || "",
          statusAdicional: celdaTexto(row, headers, "STATUS ADICIONAL"),
          fechaCreacion: parseFecha(celda(row, headers, "FECHA CREACIÓN")),
          fechaPrevista: parseFecha(celda(row, headers, "FECHA PREVISTA")),
          fechaFinalizacion: parseFecha(celda(row, headers, "FECHA FINALIZACION")),
          provincia: celdaTexto(row, headers, "PROVINCIA"),
          asignacionActual: celdaTexto(row, headers, "ASIGNACION ACTUAL"),
          comentarios: celdaTexto(row, headers, "COMENTARIOS"),
        };

        filas.push(fila);
      } catch (err) {
        errores.push(
          `Fila ${i}: Error parseando: ${err instanceof Error ? err.message : "desconocido"}`
        );
      }
    }

    console.log(
      `[excel-import] Parseadas ${filas.length} filas de LIBRO4 con ${errores.length} errores`
    );
  } catch (err) {
    errores.push(
      "Error leyendo el archivo Excel: " + (err instanceof Error ? err.message : "desconocido")
    );
  }

  return { filas, errores };
}

/**
 * Normaliza un nombre para búsqueda/comparación (minúsculas, sin espacios extra).
 */
export function normalizarNombre(nombre: string | null | undefined): string {
  if (!nombre) return "";
  return nombre
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Mapea STATUS ADICIONAL del Excel a estado de incidencia.
 */
export function mapearStatusAIncidenciaEstado(status: string | null): string {
  if (!status) return "SIN_ASIGNAR";

  const statusNorm = status.toLowerCase().trim();

  if (statusNorm.includes("pte") || statusNorm.includes("enrutar")) return "SIN_ASIGNAR";
  if (statusNorm.includes("pospuesto")) return "ASIGNADA";
  if (statusNorm.includes("en curso")) return "EN_CAMINO";
  if (statusNorm.includes("completado") || statusNorm.includes("finalizado"))
    return "RESUELTA";

  return "SIN_ASIGNAR"; // Default
}
