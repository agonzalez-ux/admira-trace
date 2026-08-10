import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

const MIN_LONGITUD = 8;

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const { passwordActual, passwordNueva, passwordConfirmacion } = body || {};

  if (!passwordActual || !passwordNueva || !passwordConfirmacion) {
    return NextResponse.json({ error: "Rellena los tres campos." }, { status: 400 });
  }
  if (passwordNueva !== passwordConfirmacion) {
    return NextResponse.json({ error: "La nueva contraseña y su confirmación no coinciden." }, { status: 400 });
  }
  if (String(passwordNueva).length < MIN_LONGITUD) {
    return NextResponse.json(
      { error: `La nueva contraseña debe tener al menos ${MIN_LONGITUD} caracteres.` },
      { status: 400 }
    );
  }

  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user) return NextResponse.json({ error: "Usuario no encontrado." }, { status: 404 });

  const actualValida = await bcrypt.compare(passwordActual, user.password);
  if (!actualValida) {
    return NextResponse.json({ error: "La contraseña actual no es correcta." }, { status: 401 });
  }

  const esLaMisma = await bcrypt.compare(passwordNueva, user.password);
  if (esLaMisma) {
    return NextResponse.json({ error: "La nueva contraseña debe ser distinta de la actual." }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      password: bcrypt.hashSync(passwordNueva, 10),
      debeCambiarPassword: false,
      passwordCambiadaAt: new Date(),
    },
  });

  return NextResponse.json({ ok: true });
}
