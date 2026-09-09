import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { signSession, SESSION_COOKIE_NAME } from "@/lib/auth";
import { ROLES } from "@/lib/constants";
import { minutosBloqueadoRestantes, registrarIntentoFallido, limpiarIntentos, obtenerIp } from "@/lib/loginAttempts";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const { role, username, password } = body || {};

  if (!role || !ROLES.includes(role)) {
    return NextResponse.json({ error: "Rol inválido." }, { status: 400 });
  }
  if (!username || !password) {
    return NextResponse.json({ error: "Usuario y contraseña son obligatorios." }, { status: 400 });
  }

  const ip = obtenerIp(req);
  const usernameNormalizado = String(username).toLowerCase().trim();

  const minutosRestantes = await minutosBloqueadoRestantes(usernameNormalizado, ip);
  if (minutosRestantes !== null) {
    return NextResponse.json(
      { error: `Demasiados intentos fallidos. Vuelve a intentarlo en ${minutosRestantes} minuto${minutosRestantes === 1 ? "" : "s"}.` },
      { status: 429 }
    );
  }

  const user = await prisma.user.findUnique({ where: { username: usernameNormalizado } });

  if (!user || !user.active || user.role !== role) {
    await registrarIntentoFallido(usernameNormalizado, ip);
    return NextResponse.json({ error: "Credenciales incorrectas para el rol seleccionado." }, { status: 401 });
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    await registrarIntentoFallido(usernameNormalizado, ip);
    return NextResponse.json({ error: "Credenciales incorrectas." }, { status: 401 });
  }

  await limpiarIntentos(usernameNormalizado, ip);

  const token = await signSession({
    userId: user.id,
    username: user.username,
    name: user.name,
    role: user.role as any,
  });

  const res = NextResponse.json({ ok: true, role: user.role });
  res.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
