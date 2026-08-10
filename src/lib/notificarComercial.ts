import { prisma } from "./prisma";
import { sendEmail } from "./email";

type TipoAviso = "PROGRAMADA" | "EN_CAMINO";

/**
 * Avisa por email al comercial del estanco vinculado a la incidencia (si lo hay
 * y tiene correo real en el directorio), y deja constancia en
 * NotificacionComercial tanto si se envía, se simula o falla.
 */
export async function notificarComercial(incidenciaId: string, tipo: TipoAviso) {
  const incidencia = await prisma.incidencia.findUnique({
    where: { id: incidenciaId },
    include: { estanco: true, tecnico: true },
  });
  if (!incidencia) return;

  const destinatario = incidencia.estanco?.correoComercial;
  const esContactoGenerico =
    !destinatario || destinatario.toLowerCase().includes("contactar con comercial");

  if (!incidencia.estanco || esContactoGenerico || !destinatario) {
    await prisma.notificacionComercial.create({
      data: {
        incidenciaId,
        tipo,
        destinatario: destinatario || null,
        estado: "ERROR",
        detalle: !incidencia.estanco
          ? "No se ha podido vincular la incidencia a ningún estanco del directorio (sin coincidencia de texto)."
          : "El estanco no tiene un email de comercial real registrado (contacto genérico).",
      },
    });
    return;
  }

  const fechaVisita = incidencia.fechaVisitaProgramada
    ? incidencia.fechaVisitaProgramada.toLocaleString("es-ES", { dateStyle: "long", timeStyle: "short" })
    : null;

  const asunto =
    tipo === "PROGRAMADA"
      ? `Visita técnica programada — ${incidencia.estanco.nombre}`
      : `El técnico está en camino — ${incidencia.estanco.nombre}`;

  const texto =
    tipo === "PROGRAMADA"
      ? `Hola,\n\nSe ha programado una visita técnica en el estanco ${incidencia.estanco.nombre} (${incidencia.estanco.direccion || ""}) para el ${fechaVisita}.\n\nIncidencia: ${incidencia.titulo}\nTécnico asignado: ${incidencia.tecnico?.name || ""}\n\nPor favor, avisad al estanquero de la fecha y hora previstas.\n\nAdmira Trace`
      : `Hola,\n\nEl técnico ${incidencia.tecnico?.name || ""} está de camino ahora mismo al estanco ${incidencia.estanco.nombre} (${incidencia.estanco.direccion || ""}) para la visita programada${fechaVisita ? ` el ${fechaVisita}` : ""}.\n\nIncidencia: ${incidencia.titulo}\n\nPor favor, avisad al estanquero.\n\nAdmira Trace`;

  const resultado = await sendEmail({ to: destinatario, subject: asunto, text: texto });

  await prisma.notificacionComercial.create({
    data: {
      incidenciaId,
      tipo,
      destinatario,
      estado: resultado.estado,
      detalle: resultado.detalle || null,
    },
  });

  await prisma.incidencia.update({
    where: { id: incidenciaId },
    data:
      tipo === "PROGRAMADA" ? { comercialAvisadoProgramada: true } : { comercialAvisadoEnCamino: true },
  });
}
