import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

/** PATCH /api/notificaciones/[id] — marcar una notificación como leída. */
export async function PATCH(_req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const notificacion = await prisma.notificacion.findUnique({ where: { id: params.id } });
  if (!notificacion || notificacion.userId !== session.userId) {
    return NextResponse.json({ error: "Notificación no encontrada." }, { status: 404 });
  }

  await prisma.notificacion.update({ where: { id: params.id }, data: { leida: true } });
  return NextResponse.json({ ok: true });
}
