import { createHash, randomBytes } from "crypto";
import { prisma } from "./prisma";
import { sendEmail } from "./email";

const VALIDEZ_DIAS = 30;

export function hashViabilidadToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Envía por email el formulario de viabilidad al comercial del estanco de
 * una instalación recién importada, con un enlace de un solo uso (mismo
 * patrón que "recuperar contraseña", pero apuntando a la incidencia en vez
 * de a un usuario, y sin necesidad de cuenta). Deja constancia en
 * NotificacionComercial tanto si se envía, se simula o falla — igual que
 * notificarComercial.ts.
 */
export async function solicitarViabilidadComercial(incidenciaId: string): Promise<void> {
  const incidencia = await prisma.incidencia.findUnique({
    where: { id: incidenciaId },
    include: { estanco: true },
  });
  if (!incidencia) return;

  const destinatario = incidencia.estanco?.correoComercial;
  const esContactoGenerico =
    !destinatario || destinatario.toLowerCase().includes("contactar con comercial");

  if (!incidencia.estanco || esContactoGenerico || !destinatario) {
    await prisma.notificacionComercial.create({
      data: {
        incidenciaId,
        tipo: "SOLICITUD_VIABILIDAD",
        destinatario: destinatario || null,
        estado: "ERROR",
        detalle: !incidencia.estanco
          ? "No se ha podido vincular la instalación a ningún estanco del directorio (sin coincidencia de texto)."
          : "El estanco no tiene un email de comercial real registrado (contacto genérico).",
      },
    });
    return;
  }

  // Invalida cualquier enlace anterior que siguiera vivo (p. ej. si se reenvía).
  await prisma.viabilidadToken.updateMany({
    where: { incidenciaId, usadoAt: null, expiraAt: { gt: new Date() } },
    data: { usadoAt: new Date() },
  });

  const token = randomBytes(32).toString("base64url");
  await prisma.viabilidadToken.create({
    data: {
      tokenHash: hashViabilidadToken(token),
      incidenciaId,
      expiraAt: new Date(Date.now() + VALIDEZ_DIAS * 24 * 60 * 60 * 1000),
    },
  });

  const base = process.env.APP_BASE_URL || "";
  const enlace = `${base}/formulario-viabilidad?token=${token}`;

  const resultado = await sendEmail({
    to: destinatario,
    subject: `Confirmar viabilidad de instalación — ${incidencia.estanco.nombre}`,
    text: `Hola,

Vamos a instalar "${incidencia.titulo}" en ${incidencia.estanco.nombre}${incidencia.estanco.direccion ? ` (${incidencia.estanco.direccion})` : ""}.

Antes de mandar al técnico necesitamos que confirméis unos datos del sitio de instalación (5 minutos, sin necesidad de crear ninguna cuenta):

${enlace}

El enlace es válido durante ${VALIDEZ_DIAS} días y solo se puede usar una vez.

Gracias,
Altadis Soporte`,
  });

  await prisma.notificacionComercial.create({
    data: {
      incidenciaId,
      tipo: "SOLICITUD_VIABILIDAD",
      destinatario,
      estado: resultado.estado,
      detalle: resultado.detalle || null,
    },
  });
}
