import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { syncDeskTickets, DESK_CONFIGURED, ampliarVentanaDeskDias, obtenerVentanaDeskDias } from "@/lib/desk";
import { syncHardwareDesconectado, HARDWARE_SYNC_CONFIGURADO } from "@/lib/hardwareSync";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "ADMIRA") {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }
  if (!DESK_CONFIGURED) {
    return NextResponse.json({ error: "La integración con el desk no está configurada." }, { status: 400 });
  }

  // El botón "Mostrar más" de la bandeja "Sin asignar" pide ampliar la
  // ventana de antigüedad antes de sincronizar, para traer tickets más
  // antiguos del desk que hasta ahora se ignoraban.
  const body = await req.json().catch(() => ({}));
  if (body?.ampliarVentana) {
    ampliarVentanaDeskDias();
  }

  let nuevas = 0;
  let actualizadas = 0;
  let errorDesk: string | null = null;

  // Se separan en dos try/catch independientes: un fallo del desk (p. ej. de
  // red) no debe impedir que la sincronización de pantallas desconectadas
  // (que usa la API de Google Sheets, no la del desk) siga funcionando.
  try {
    const resultado = await syncDeskTickets(true);
    nuevas += resultado.nuevas;
    actualizadas += resultado.actualizadas;
  } catch (err: any) {
    errorDesk = err?.message || "Error al sincronizar con el desk.";
  }

  if (HARDWARE_SYNC_CONFIGURADO) {
    try {
      const hw = await syncHardwareDesconectado(true);
      nuevas += hw.nuevas;
      actualizadas += hw.actualizadas;
    } catch (err) {
      console.error("[hardware-sync] Error sincronizando pantallas desconectadas:", err);
    }
  }

  if (errorDesk) {
    return NextResponse.json({ error: errorDesk, nuevas, actualizadas }, { status: 502 });
  }
  return NextResponse.json({ ok: true, nuevas, actualizadas, ventanaDias: obtenerVentanaDeskDias() });
}

export async function GET() {
  const session = await getSession();
  if (!session || (session.role !== "ADMIRA" && session.role !== "FDM")) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }
  return NextResponse.json({ configured: DESK_CONFIGURED, ventanaDias: obtenerVentanaDeskDias() });
}
