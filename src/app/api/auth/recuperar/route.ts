import { NextRequest, NextResponse } from "next/server";
import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";

const VALIDEZ_MINUTOS = 60;

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const email = String(body?.email || "").trim().toLowerCase();

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Introduce un email válido." }, { status: 400 });
  }

  const user = await prisma.user.findFirst({ where: { email: { equals: email }, active: true } });

  // Siempre se responde igual, exista o no la cuenta: así nadie puede usar este
  // formulario para averiguar qué emails están dados de alta.
  const respuestaGenerica = NextResponse.json({
    ok: true,
    mensaje: "Si ese email corresponde a una cuenta, te hemos enviado un enlace para restablecer la contraseña.",
  });

  if (!user) return respuestaGenerica;

  // Invalidamos los enlaces anteriores que siguieran vivos.
  await prisma.passwordResetToken.updateMany({
    where: { userId: user.id, usadoAt: null, expiraAt: { gt: new Date() } },
    data: { usadoAt: new Date() },
  });

  const token = randomBytes(32).toString("base64url");
  await prisma.passwordResetToken.create({
    data: {
      tokenHash: hashToken(token),
      userId: user.id,
      expiraAt: new Date(Date.now() + VALIDEZ_MINUTOS * 60 * 1000),
    },
  });

  const base = process.env.APP_BASE_URL || req.nextUrl.origin;
  const enlace = `${base}/restablecer?token=${token}`;

  await sendEmail({
    to: user.email!,
    subject: "Restablecer tu contraseña — Admira Trace",
    text: `Hola ${user.name},

Has solicitado restablecer la contraseña de tu cuenta en Admira Trace (usuario: ${user.username}).

Abre este enlace para elegir una contraseña nueva:
${enlace}

El enlace caduca en ${VALIDEZ_MINUTOS} minutos y solo se puede usar una vez.

Si no has sido tú, ignora este mensaje: tu contraseña actual seguirá funcionando.

Admira Trace`,
  });

  return respuestaGenerica;
}
