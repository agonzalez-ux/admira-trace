import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

/**
 * POST /api/push/suscribir
 * Guarda (o actualiza, si el navegador reutiliza el mismo endpoint) la
 * suscripción push del usuario logueado.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const endpoint = body?.endpoint;
  const p256dh = body?.keys?.p256dh;
  const auth = body?.keys?.auth;
  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: "Suscripción incompleta." }, { status: 400 });
  }

  await prisma.pushSubscription.upsert({
    where: { endpoint },
    update: { userId: session.userId, p256dh, auth },
    create: { userId: session.userId, endpoint, p256dh, auth },
  });

  return NextResponse.json({ ok: true });
}

/** DELETE /api/push/suscribir — dejar de recibir push en este dispositivo. */
export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const endpoint = body?.endpoint;
  if (!endpoint) return NextResponse.json({ error: "Falta endpoint." }, { status: 400 });

  await prisma.pushSubscription.deleteMany({ where: { endpoint, userId: session.userId } });
  return NextResponse.json({ ok: true });
}
