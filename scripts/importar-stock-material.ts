/**
 * Importa el stock real de material (pantallas, PCs, tablets y routers) desde
 * el Excel "STOCK PANTALLAS FASE 5 AGOSTO 2026.xlsx" (subido a Google Drive,
 * compartido con la cuenta de servicio) a la tabla Material de la app.
 *
 * Por defecto corre en modo PRUEBA (no escribe nada, solo imprime estadísticas
 * de lo que haría). Para escribir de verdad: DRY_RUN=false.
 *
 * Uso:
 *   npx tsx scripts/importar-stock-material.ts            # solo informa
 *   DRY_RUN=false npx tsx scripts/importar-stock-material.ts   # importa de verdad
 *
 * Alcance (hojas incluidas, con serial real por unidad):
 *   - STOCK       (pantallas, PCs, tablets)
 *   - Routers     (routers generales)
 *   - STOCK BLU   (routers del proyecto MyBlu)
 * Excluidas a propósito: TFTs Rotas / Routers Punto limpio (material roto o
 * retirado, no es stock activo), SIMs (no es un tipo de Material de la app),
 * MATERIAL SIN SN (no tiene número de serie individual, son accesorios a
 * granel), MATERIAL EXTRA (es un registro de peticiones de envío, no stock),
 * hojas de resumen/pivote (TFT * TECS, PCS TECS, Resumen Routers *), BBDD NOV
 * 25 (censo de estancos antiguo, ya superado por "Universo Comerciales"),
 * SEGUIMIENTO TÉCNICOS / Listado (nada que ver con material) y SOLICITUD DE
 * BAJA (bajas de SIM).
 *
 * Reglas de mapeo:
 *   - tipo: STOCK.PANTALLA → PANTALLA; STOCK.PC → PC; STOCK.TABLET → OTRO
 *     (con tipoPersonalizado); Routers → ROUTER; STOCK BLU → ROUTER, salvo
 *     las unidades que en realidad son un PC/MiniPC coladas en esa hoja,
 *     que también van a PC.
 *   - estado (por prioridad):
 *       1. Si *INSTALADA/Instalado = "SI" y hay estanco → INSTALADO,
 *          ubicacion = nombre del estanco.
 *       2. Si el campo técnico contiene "FDM COMUNICACIÓN" → EN_FDM.
 *       3. Si contiene "ADMIRA DIGITAL NETWORKS" → EN_ADMIRA.
 *       4. Si el nombre coincide (normalizado) con una cuenta de técnico ya
 *          importada → EN_TECNICO + tecnicoId enlazado.
 *       5. Si hay nombre de técnico pero no coincide con ninguna cuenta →
 *          EN_TECNICO sin cuenta enlazada; el nombre real queda en la
 *          descripción para poder revisarlo luego (decisión explícita del
 *          usuario, en vez de descartar esas unidades).
 *       6. Si no hay ni instalación ni técnico → EN_FDM (por defecto, es el
 *          almacén principal de recepción).
 *   - "Estado de TFT" = KO (hoja STOCK) fuerza estado = BAJA, sea lo que sea
 *     lo anterior.
 *   - Duplicados de número de serie dentro de una misma hoja: gana la última
 *     fila (se asume que refleja el estado más reciente).
 *   - Duplicados entre hojas (Routers y STOCK BLU comparten 16 números de
 *     serie): gana la fila de "Routers", se descarta la de "STOCK BLU".
 *   - Filas cuyo serial aparece también en "TFTs Rotas" o "Routers Punto
 *     limpio" (roto/retirado) se excluyen de esta importación.
 *   - numeroSerie es único en toda la app: si una fila coincide con un
 *     Material que ya existe en la base de datos (por ejemplo, si este
 *     script se ejecuta dos veces), esa fila se salta sin tocar el registro
 *     existente.
 */
import { google } from "googleapis";
import ExcelJS from "exceljs";
import { prisma } from "../src/lib/prisma";
import { proyectoDesdeTextoMaterial } from "../src/lib/proyectos";

const CLIENT_EMAIL = process.env.GOOGLE_SHEETS_CLIENT_EMAIL;
const PRIVATE_KEY = (process.env.GOOGLE_SHEETS_PRIVATE_KEY || "").split("\\n").join("\n");
const FILE_ID = "1vF7wnXUmlDB_0D5q1D6FDjyRLs4aiEx_"; // "STOCK PANTALLAS FASE 5 AGOSTO 2026.xlsx"
const DRY_RUN = process.env.DRY_RUN !== "false";

function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.,]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cell(row: ExcelJS.Row, col: number): string {
  if (col <= 0) return "";
  const v = row.getCell(col).value;
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object" && "result" in (v as any)) return String((v as any).result ?? "").trim();
  if (typeof v === "object" && "richText" in (v as any)) return (v as any).richText.map((t: any) => t.text).join("");
  return String(v).trim();
}

async function descargarExcel(): Promise<Buffer> {
  if (!CLIENT_EMAIL || !PRIVATE_KEY) throw new Error("Faltan credenciales GOOGLE_SHEETS_CLIENT_EMAIL / GOOGLE_SHEETS_PRIVATE_KEY.");
  const auth = new google.auth.JWT({ email: CLIENT_EMAIL, key: PRIVATE_KEY, scopes: ["https://www.googleapis.com/auth/drive.readonly"] });
  const drive = google.drive({ version: "v3", auth });
  const res = await drive.files.get({ fileId: FILE_ID, alt: "media" }, { responseType: "arraybuffer" });
  return Buffer.from(res.data as ArrayBuffer);
}

function leerSeriales(wb: ExcelJS.Workbook, hoja: string, col: number): Set<string> {
  const ws = wb.getWorksheet(hoja);
  const s = new Set<string>();
  if (!ws) return s;
  for (let r = 2; r <= ws.rowCount; r++) {
    const v = cell(ws.getRow(r), col).toUpperCase();
    if (v) s.add(v);
  }
  return s;
}

type Candidato = {
  numeroSerie: string;
  tipo: string;
  tipoPersonalizado: string | null;
  nombre: string;
  descripcion: string;
  imei: string | null;
  proyecto: string | null;
  estado: string;
  tecnicoId: string | null;
  ubicacion: string | null;
  origenHoja: string;
};

function resolverEstado(
  tecnicoPorNombre: Map<string, string>,
  instalada: string,
  estanco: string,
  tecnicoNombreRaw: string
): { estado: string; tecnicoId: string | null; ubicacion: string | null; notaTecnico: string | null } {
  if (instalada.toUpperCase() === "SI" && estanco) {
    return { estado: "INSTALADO", tecnicoId: null, ubicacion: estanco, notaTecnico: tecnicoNombreRaw || null };
  }
  if (!tecnicoNombreRaw) return { estado: "EN_FDM", tecnicoId: null, ubicacion: null, notaTecnico: null };

  const norm = normalizar(tecnicoNombreRaw);
  if (norm.includes("fdm comunicacion")) return { estado: "EN_FDM", tecnicoId: null, ubicacion: null, notaTecnico: null };
  if (norm.includes("admira digital networks")) return { estado: "EN_ADMIRA", tecnicoId: null, ubicacion: null, notaTecnico: null };

  const id = tecnicoPorNombre.get(norm);
  if (id) return { estado: "EN_TECNICO", tecnicoId: id, ubicacion: null, notaTecnico: null };

  return { estado: "EN_TECNICO", tecnicoId: null, ubicacion: null, notaTecnico: tecnicoNombreRaw };
}

async function main() {
  console.log(DRY_RUN ? "=== MODO PRUEBA: no se escribe nada en la base de datos ===" : "=== IMPORTACIÓN REAL ===");

  console.log("Descargando Excel desde Google Drive...");
  const buffer = await descargarExcel();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);

  const tecnicos = await prisma.user.findMany({ where: { role: "TECNICO" }, select: { id: true, name: true } });
  const tecnicoPorNombre = new Map(tecnicos.map((t) => [normalizar(t.name), t.id] as const));
  console.log(`Cuentas de técnico cargadas: ${tecnicoPorNombre.size}`);

  const seialesRotas = leerSeriales(wb, "TFTs Rotas", 6);
  const serialesPuntoLimpio = leerSeriales(wb, "Routers Punto limpio", 3);

  const candidatos = new Map<string, Candidato>(); // numeroSerie -> candidato (last-wins dentro + entre hojas)
  const stats = {
    vacias: 0,
    excluidasRotas: 0,
    excluidasPuntoLimpio: 0,
    duplicadosDentroHoja: 0,
    duplicadosEntreHojas: 0,
    porHoja: {} as Record<string, number>,
    porTipo: {} as Record<string, number>,
    porEstado: {} as Record<string, number>,
    sinTecnicoVinculado: 0,
  };

  // --- STOCK: pantallas, PCs, tablets ---
  const wsStock = wb.getWorksheet("STOCK")!;
  let nSTOCK = 0;
  for (let r = 2; r <= wsStock.rowCount; r++) {
    const row = wsStock.getRow(r);
    const serial = cell(row, 2).toUpperCase();
    if (!serial) { stats.vacias++; continue; }
    if (seialesRotas.has(serial)) { stats.excluidasRotas++; continue; }

    const emisor = cell(row, 1);
    const tipoRaw = cell(row, 4).toUpperCase();
    const marca = cell(row, 5);
    const modelo = cell(row, 6);
    const instalada = cell(row, 7);
    const estanco = cell(row, 8);
    const tecnicoRaw = cell(row, 9);
    const proyecto = cell(row, 10);
    const estadoTft = cell(row, 14).toUpperCase();
    const comentario = cell(row, 15);

    let tipo = "OTRO";
    let tipoPersonalizado: string | null = tipoRaw || "OTRO";
    if (tipoRaw === "PANTALLA") { tipo = "PANTALLA"; tipoPersonalizado = null; }
    else if (tipoRaw === "PC") { tipo = "PC"; tipoPersonalizado = null; }
    else if (tipoRaw === "TABLET") tipoPersonalizado = "Tablet";

    const { estado: estadoBase, tecnicoId, ubicacion, notaTecnico } = resolverEstado(tecnicoPorNombre, instalada, estanco, tecnicoRaw);
    const estado = estadoTft === "KO" ? "BAJA" : estadoBase;
    if (estado === "EN_TECNICO" && !tecnicoId) stats.sinTecnicoVinculado++;

    const nombre = [marca, modelo].filter(Boolean).join(" ").trim() || (tipo === "PANTALLA" ? "Pantalla" : tipoRaw || "Material");
    const notas = [
      "Importado de la hoja STOCK del Excel de inventario.",
      emisor && `Emisor: ${emisor}.`,
      proyecto && `Proyecto: ${proyecto}.`,
      comentario && `Comentario original: ${comentario}.`,
      estadoTft && `Estado de TFT original: ${estadoTft}.`,
      notaTecnico && `Técnico original (sin cuenta vinculada): ${notaTecnico}.`,
    ].filter(Boolean).join(" ");

    if (candidatos.has(serial)) stats.duplicadosDentroHoja++;
    candidatos.set(serial, { numeroSerie: serial, tipo, tipoPersonalizado, nombre, descripcion: notas, imei: null, proyecto: proyectoDesdeTextoMaterial(proyecto), estado, tecnicoId, ubicacion, origenHoja: "STOCK" });
    nSTOCK++;
  }
  stats.porHoja["STOCK"] = nSTOCK;

  // --- Routers ---
  const wsRouters = wb.getWorksheet("Routers")!;
  let nRouters = 0;
  for (let r = 2; r <= wsRouters.rowCount; r++) {
    const row = wsRouters.getRow(r);
    const serial = cell(row, 4).toUpperCase();
    if (!serial) { stats.vacias++; continue; }
    if (serialesPuntoLimpio.has(serial)) { stats.excluidasPuntoLimpio++; continue; }

    const marca = cell(row, 2);
    const modelo = cell(row, 3);
    const imei = cell(row, 5);
    const tecnicoRaw = cell(row, 6);
    const instalado = cell(row, 8);
    const proyecto = cell(row, 9);
    const estanco = cell(row, 10);
    const comentarios = cell(row, 11);

    const { estado, tecnicoId, ubicacion, notaTecnico } = resolverEstado(tecnicoPorNombre, instalado, estanco, tecnicoRaw);
    if (estado === "EN_TECNICO" && !tecnicoId) stats.sinTecnicoVinculado++;

    const nombre = [marca, modelo].filter(Boolean).join(" ").trim() || "Router";
    const notas = [
      "Importado de la hoja Routers del Excel de inventario.",
      proyecto && `Proyecto: ${proyecto}.`,
      imei && `IMEI: ${imei}.`,
      comentarios && `Comentarios: ${comentarios}.`,
      notaTecnico && `Técnico original (sin cuenta vinculada): ${notaTecnico}.`,
    ].filter(Boolean).join(" ");

    if (candidatos.has(serial)) stats.duplicadosDentroHoja++;
    candidatos.set(serial, { numeroSerie: serial, tipo: "ROUTER", tipoPersonalizado: null, nombre, descripcion: notas, imei: imei || null, proyecto: proyectoDesdeTextoMaterial(proyecto), estado, tecnicoId, ubicacion, origenHoja: "Routers" });
    nRouters++;
  }
  stats.porHoja["Routers"] = nRouters;

  // --- STOCK BLU (routers del proyecto MyBlu) ---
  const wsBlu = wb.getWorksheet("STOCK BLU")!;
  let nBlu = 0;
  for (let r = 2; r <= wsBlu.rowCount; r++) {
    const row = wsBlu.getRow(r);
    const serial = cell(row, 3).toUpperCase();
    if (!serial) { stats.vacias++; continue; }
    if (candidatos.has(serial) && candidatos.get(serial)!.origenHoja === "Routers") { stats.duplicadosEntreHojas++; continue; }

    const modelo = cell(row, 2);
    const imei = cell(row, 4);
    const tecnicoRaw = cell(row, 5);
    const instalado = cell(row, 7);
    const proyecto = cell(row, 8);
    const estanco = cell(row, 9);
    const comentarios = cell(row, 10);

    const { estado, tecnicoId, ubicacion, notaTecnico } = resolverEstado(tecnicoPorNombre, instalado, estanco, tecnicoRaw);
    if (estado === "EN_TECNICO" && !tecnicoId) stats.sinTecnicoVinculado++;

    // La columna "Modelo Router" de esta hoja también cuela algunos MiniPC /
    // PCs de verdad (p. ej. "MiniPC", "PC ASUS PN64") mezclados con routers.
    const esPc = /PC/i.test(modelo);
    const nombre = modelo || (esPc ? "PC" : "Router");
    const notas = [
      "Importado de la hoja STOCK BLU del Excel de inventario.",
      proyecto && `Proyecto: ${proyecto}.`,
      imei && `IMEI: ${imei}.`,
      comentarios && `Comentarios: ${comentarios}.`,
      notaTecnico && `Técnico original (sin cuenta vinculada): ${notaTecnico}.`,
    ].filter(Boolean).join(" ");

    if (candidatos.has(serial)) stats.duplicadosDentroHoja++;
    candidatos.set(serial, {
      numeroSerie: serial,
      tipo: esPc ? "PC" : "ROUTER",
      tipoPersonalizado: null,
      nombre,
      descripcion: notas,
      imei: imei || null,
      proyecto: proyectoDesdeTextoMaterial(proyecto),
      estado,
      tecnicoId,
      ubicacion,
      origenHoja: "STOCK BLU",
    });
    nBlu++;
  }
  stats.porHoja["STOCK BLU"] = nBlu;

  for (const c of candidatos.values()) {
    stats.porTipo[c.tipo] = (stats.porTipo[c.tipo] || 0) + 1;
    stats.porEstado[c.estado] = (stats.porEstado[c.estado] || 0) + 1;
  }

  console.log("\n=== RESUMEN ===");
  console.log(`Candidatos únicos a importar: ${candidatos.size}`);
  console.log("Por hoja de origen (antes de deduplicar entre hojas):", stats.porHoja);
  console.log("Por tipo:", stats.porTipo);
  console.log("Por estado:", stats.porEstado);
  console.log(`Sin técnico vinculado (nombre no reconocido): ${stats.sinTecnicoVinculado}`);
  console.log(`Filas sin número de serie (excluidas): ${stats.vacias}`);
  console.log(`Excluidas por estar en "TFTs Rotas": ${stats.excluidasRotas}`);
  console.log(`Excluidas por estar en "Routers Punto limpio": ${stats.excluidasPuntoLimpio}`);
  console.log(`Duplicados dentro de la misma hoja (se quedó la última fila): ${stats.duplicadosDentroHoja}`);
  console.log(`Duplicados entre hojas Routers/STOCK BLU (ganó Routers): ${stats.duplicadosEntreHojas}`);

  if (DRY_RUN) {
    console.log("\nModo prueba: no se ha escrito nada. Ejecuta con DRY_RUN=false para importar de verdad.");
    return;
  }

  console.log("\nEscribiendo en la base de datos...");
  let creados = 0;
  let yaExistian = 0;
  let errores = 0;
  for (const c of candidatos.values()) {
    try {
      const existente = await prisma.material.findUnique({ where: { numeroSerie: c.numeroSerie } });
      if (existente) { yaExistian++; continue; }
      await prisma.material.create({
        data: {
          numeroSerie: c.numeroSerie,
          tipo: c.tipo,
          tipoPersonalizado: c.tipoPersonalizado,
          nombre: c.nombre,
          descripcion: c.descripcion,
          imei: c.imei,
          proyecto: c.proyecto,
          estado: c.estado,
          tecnicoId: c.tecnicoId,
          ubicacion: c.ubicacion,
        },
      });
      creados++;
    } catch (e) {
      errores++;
      console.error(`Error importando ${c.numeroSerie}:`, e);
    }
  }
  console.log(`\nCreados: ${creados}. Ya existían (saltados): ${yaExistian}. Errores: ${errores}.`);
}

main()
  .catch((e) => {
    console.error("ERROR FATAL:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
