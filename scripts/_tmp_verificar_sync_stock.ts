/**
 * Script de comprobación (NO escribe nada en Drive ni en la BD): descarga el
 * STOCK.xlsx real, cruza sus números de serie con los materiales de la app,
 * y muestra cuántos coincidirían y qué valores se escribirían — para
 * verificar antes de activar el sync real. Borrar tras usarlo.
 */
import { google } from "googleapis";
import ExcelJS from "exceljs";
import { prisma } from "../src/lib/prisma";
import { PROYECTO_LABELS } from "../src/lib/constants";

// docker run --env-file (a diferencia del loader de Next.js) no quita las
// comillas envolventes de KEY="valor", así que hay que quitarlas a mano
// antes de deshacer los "\n" escapados.
function limpiarEnv(v: string | undefined): string | undefined {
  return v?.replace(/^"|"$/g, "");
}

async function main() {
  const privateKey = limpiarEnv(process.env.GOOGLE_SHEETS_PRIVATE_KEY)?.replace(/\\n/g, "\n");
  const auth = new google.auth.JWT({
    email: limpiarEnv(process.env.GOOGLE_SHEETS_CLIENT_EMAIL),
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/drive"],
  });
  const drive = google.drive({ version: "v3", auth });
  const fileId = limpiarEnv(process.env.GOOGLE_SHEETS_STOCK_ID)!;
  console.log("Usando GOOGLE_SHEETS_STOCK_ID:", fileId);

  const materiales = await prisma.material.findMany({ include: { tecnico: true, estancoInstalado: true } });
  console.log(`Materiales en la BD (producción): ${materiales.length}`);
  const porSerie = new Map(materiales.map((m) => [m.numeroSerie.trim(), m]));

  const descarga = await drive.files.get({ fileId, alt: "media" }, { responseType: "arraybuffer" });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(descarga.data as ArrayBuffer) as any);
  const ws = wb.getWorksheet("STOCK")!;
  console.log(`Pestaña STOCK real: ${ws.rowCount} filas`);

  let coincidencias = 0;
  const ejemplos: string[] = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const fila = ws.getRow(r);
    const serie = fila.getCell(2).value;
    if (!serie) continue;
    const m = porSerie.get(String(serie).trim());
    if (!m) continue;
    coincidencias++;
    if (ejemplos.length < 10) {
      const proyecto = m.proyecto ? PROYECTO_LABELS[m.proyecto as keyof typeof PROYECTO_LABELS] || m.proyecto : "";
      ejemplos.push(
        `Fila ${r} SN=${serie} -> INSTALADA=${m.estado === "INSTALADO" ? "SI" : ""}, Estanco=${m.estancoInstalado?.nombre || ""}, ` +
          `Tecnico=${m.tecnico?.name || ""}, Proyecto=${proyecto}, ProvinciaTec=${m.tecnico?.zona || ""}`
      );
    }
  }
  console.log(`\nCoincidencias por número de serie: ${coincidencias} de ${materiales.length} materiales de la app`);
  console.log("\nEjemplos de lo que se escribiría (primeras 10 coincidencias):");
  ejemplos.forEach((e) => console.log(" - " + e));
}

main()
  .catch((e) => {
    console.error("ERROR:", e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
