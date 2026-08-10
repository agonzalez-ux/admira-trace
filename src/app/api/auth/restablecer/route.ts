import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

const MIN_LONGITUD = 8;

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/** Comprueba si un enlace de restablecimiento sigue siendo válido. */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.json({ valido: false, error: "Falta el token." }, { status: 400 });

  const registro = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { select: { name: true, username: true } } },
  });

  if (!registro || registro.usadoAt || registro.expiraAt < new Date()) {
    return NextResponse.json({ valido: false, error: "El enlace no es válido o ha caducado." }, { status: 400 });
  }

  return NextResponse.json({ valido: true, nombre: registro.user.name, usuario: registro.user.username });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const { token, passwordNueva, passwordConfirmacion } = body || {};

  if (!token) return NextResponse.json({ error: "Falta el token." }, { status: 400 });
  if (!passwordNueva || !passwordConfirmacion) {
    return NextResponse.json({ error: "Rellena los dos campos." }, { status: 400 });
  }
  if (passwordNueva !== passwordConfirmacion) {
    return NextResponse.json({ error: "Las dos contraseñas no coinciden." }, { status: 400 });
  }
  if (String(passwordNueva).length < MIN_LONGITUD) {
    return NextResponse.json(
      { error: `La contraseña debe tener al menos ${MIN_LONGITUD} caracteres.` },
      { status: 400 }
    );
  }

  const registro = await prisma.passwordResetToken.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!registro || registro.usadoAt || registro.expiraAt < new Date()) {
    return NextResponse.json({ error: "El enlace no es válido o ha caducado." }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: registro.userId },
    data: {
      password: bcrypt.hashSync(passwordNueva, 10),
      debeCambiarPassword: false,
      passwordCambiadaAt: new Date(),
    },
  });

  // El token es de un solo uso.
  await prisma.passwordResetToken.update({
    where: { id: registro.id },
    data: { usadoAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
