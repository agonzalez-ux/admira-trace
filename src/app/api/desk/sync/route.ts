import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { syncDeskTickets, DESK_CONFIGURED } from "@/lib/desk";
import { syncHardwareDesconectado, HARDWARE_SYNC_CONFIGURADO } from "@/lib/hardwareSync";

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
    let nuevas = resultado.nuevas;
    let actualizadas = resultado.actualizadas;

    if (HARDWARE_SYNC_CONFIGURADO) {
      const hw = await syncHardwareDesconectado(true);
      nuevas += hw.nuevas;
      actualizadas += hw.actualizadas;
    }

    return NextResponse.json({ ok: true, nuevas, actualizadas });
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
