import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

/**
 * GET /api/notificaciones
 * Lista las notificaciones del usuario logueado, más recientes primero.
 * La campanita hace polling a este endpoint.
 */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const [notificaciones, noLeidas] = await Promise.all([
    prisma.notificacion.findMany({
      where: { userId: session.userId },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    prisma.notificacion.count({ where: { userId: session.userId, leida: false } }),
  ]);

  return NextResponse.json({ notificaciones, noLeidas });
}
