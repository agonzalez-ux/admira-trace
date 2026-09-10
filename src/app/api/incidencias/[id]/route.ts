import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { syncToSheets } from "@/lib/googleSheets";
import { notificarComercial } from "@/lib/notificarComercial";
import { crearNotificacion } from "@/lib/notificaciones";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || session.role !== "TECNICO") {
    return NextResponse.json({ error: "Solo el técnico asignado puede actualizar la incidencia." }, { status: 403 });
  }

  const incidencia = await prisma.incidencia.findUnique({ where: { id: params.id } });
  if (!incidencia) return NextResponse.json({ error: "Incidencia no encontrada." }, { status: 404 });
  if (incidencia.tecnicoId !== session.userId) {
    return NextResponse.json({ error: "Esta incidencia no está asignada a tu cuenta." }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const { estado } = body || {};

  if (!["EN_CAMINO", "EN_SITIO", "RESUELTA"].includes(estado)) {
    return NextResponse.json({ error: "Estado no válido." }, { status: 400 });
  }

  if (estado === "EN_CAMINO" && incidencia.estado !== "ASIGNADA") {
    return NextResponse.json({ error: "La incidencia ya está en camino o resuelta." }, { status: 409 });
  }
  if (estado === "EN_CAMINO" && !incidencia.fechaVisitaProgramada) {
    return NextResponse.json({ error: "Programa primero el día y la hora de la visita." }, { status: 409 });
  }
  if (estado === "EN_SITIO" && incidencia.estado !== "EN_CAMINO") {
    return NextResponse.json({ error: "Marca primero 'en camino' antes de llegar al estanco." }, { status: 409 });
  }
  if (estado === "RESUELTA" && incidencia.estado !== "EN_SITIO") {
    return NextResponse.json({ error: "Marca primero que has llegado al estanco antes de resolver." }, { status: 409 });
  }

  const updated = await prisma.incidencia.update({
    where: { id: params.id },
    data: {
      estado,
      fechaEnCamino: estado === "EN_CAMINO" ? new Date() : undefined,
      fechaEnSitio: estado === "EN_SITIO" ? new Date() : undefined,
      fechaResuelta: estado === "RESUELTA" ? new Date() : undefined,
    },
    include: { fotos: true, materialesUsados: { include: { material: true } }, tecnico: true, estanco: true },
  });

  // Solo "en camino" avisa por email al comercial del estanco (para que
  // avise al estanquero) — "he llegado" y "resuelto" son solo para que el
  // equipo de Admira lo sepa, no le interesan al comercial por email.
  if (estado === "EN_CAMINO") {
    notificarComercial(params.id, "EN_CAMINO").catch((err) =>
      console.error("[notificar-comercial] Error avisando de que el técnico está en camino:", err)
    );
  }

  const NOTIF_POR_ESTADO = {
    EN_CAMINO: { tipo: "INCIDENCIA_EN_CAMINO" as const, titulo: "Técnico en camino" },
    EN_SITIO: { tipo: "INCIDENCIA_EN_SITIO" as const, titulo: "Técnico en el estanco" },
    RESUELTA: { tipo: "INCIDENCIA_RESUELTA" as const, titulo: "Incidencia resuelta" },
  } as const;

  // Avisa (campanita + push) a quien asignó el ticket, sea cual sea el paso.
  if (updated.creadoPorId) {
    const { tipo, titulo } = NOTIF_POR_ESTADO[estado as keyof typeof NOTIF_POR_ESTADO];
    await crearNotificacion({
      userId: updated.creadoPorId,
      tipo,
      titulo,
      mensaje: `${updated.tecnico?.name || "El técnico"} · ${updated.titulo}`,
      entidadTipo: "incidencia",
      entidadId: updated.id,
    });
  }

  await syncToSheets(["incidencias", "tecnicos", "intervenciones", "censo"]);

  return NextResponse.json({ incidencia: updated });
}
