import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { syncToSheets } from "@/lib/googleSheets";
import { notificarComercial } from "@/lib/notificarComercial";

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

  if (!["EN_CAMINO", "RESUELTA"].includes(estado)) {
    return NextResponse.json({ error: "Estado no válido." }, { status: 400 });
  }

  if (estado === "EN_CAMINO" && incidencia.estado !== "ASIGNADA") {
    return NextResponse.json({ error: "La incidencia ya está en camino o resuelta." }, { status: 409 });
  }
  if (estado === "EN_CAMINO" && !incidencia.fechaVisitaProgramada) {
    return NextResponse.json({ error: "Programa primero el día y la hora de la visita." }, { status: 409 });
  }
  if (estado === "RESUELTA" && incidencia.estado !== "EN_CAMINO") {
    return NextResponse.json({ error: "Marca primero 'en camino' antes de resolver." }, { status: 409 });
  }

  const updated = await prisma.incidencia.update({
    where: { id: params.id },
    data: {
      estado,
      fechaEnCamino: estado === "EN_CAMINO" ? new Date() : undefined,
      fechaResuelta: estado === "RESUELTA" ? new Date() : undefined,
    },
    include: { fotos: true, materialesUsados: { include: { material: true } }, tecnico: true, estanco: true },
  });

  if (estado === "EN_CAMINO") {
    notificarComercial(params.id, "EN_CAMINO").catch((err) =>
      console.error("[notificar-comercial] Error avisando de que el técnico está en camino:", err)
    );
  }

  await syncToSheets(["incidencias", "tecnicos", "intervenciones", "censo"]);

  return NextResponse.json({ incidencia: updated });
}
