import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { syncDeskTickets, DESK_CONFIGURED } from "@/lib/desk";

export async function POST() {
  const session = await getSession();
  if (!session || session.role !== "ADMIRA") {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }
  if (!DESK_CONFIGURED) {
    return NextResponse.json({ error: "La integración con el desk no está configurada." }, { status: 400 });
  }

  try {
    const resultado = await syncDeskTickets(true);
    return NextResponse.json({ ok: true, ...resultado });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Error al sincronizar con el desk." }, { status: 502 });
  }
}

export async function GET() {
  const session = await getSession();
  if (!session || (session.role !== "ADMIRA" && session.role !== "FDM")) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }
  return NextResponse.json({ configured: DESK_CONFIGURED });
}
