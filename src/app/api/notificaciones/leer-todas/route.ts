import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

/** POST /api/notificaciones/leer-todas — marcar todas mis notificaciones como leídas. */
export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  await prisma.notificacion.updateMany({
    where: { userId: session.userId, leida: false },
    data: { leida: true },
  });

  return NextResponse.json({ ok: true });
}
