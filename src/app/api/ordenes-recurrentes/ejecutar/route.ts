import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { ejecutarOrdenesRecurrentesPendientes } from "@/lib/ordenesRecurrentes";

/**
 * Fuerza la comprobación de órdenes recurrentes vencidas. Normalmente lo hace
 * solo el scheduler interno (cada hora), pero este endpoint permite dispararlo
 * a mano — o desde un cron externo si algún día se despliega en serverless.
 */
export async function POST() {
  const session = await getSession();
  if (!session || session.role !== "ADMIRA") {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  const resultado = await ejecutarOrdenesRecurrentesPendientes();
  return NextResponse.json({ ok: true, ...resultado });
}
