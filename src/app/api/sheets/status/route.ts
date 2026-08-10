import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { SHEETS_CONFIGURED, SHEETS_URL, syncToSheets, getSheetTabLinks, getDocumentUrls } from "@/lib/googleSheets";
import { DOCUMENTOS } from "@/lib/documentSheets";

export async function GET() {
  const session = await getSession();
  if (!session || (session.role !== "ADMIRA" && session.role !== "FDM")) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  let links: Record<string, string> | null = null;
  if (SHEETS_CONFIGURED) {
    try {
      links = await getSheetTabLinks();
    } catch (err) {
      console.error("[sheets-status] Error obteniendo enlaces de pestañas:", err);
    }
  }

  const documentUrls = getDocumentUrls();
  const documentTitles = Object.fromEntries(
    Object.entries(DOCUMENTOS).map(([key, doc]) => [key, doc.titulo])
  );

  return NextResponse.json({
    configured: SHEETS_CONFIGURED,
    url: SHEETS_URL,
    links,
    documentUrls,
    documentTitles,
  });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session || session.role !== "ADMIRA") {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const incluirEstancos = Boolean(body?.incluirEstancos);

  await syncToSheets(["materiales", "envios", "incidencias", "tecnicos", "intervenciones", "censo"]);
  if (incluirEstancos) {
    await syncToSheets("estancos", { forceEstancos: true });
  }
  return NextResponse.json({ ok: true });
}
