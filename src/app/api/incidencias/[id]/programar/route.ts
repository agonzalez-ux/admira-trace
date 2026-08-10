import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { syncToSheets } from "@/lib/googleSheets";
import { notificarComercial } from "@/lib/notificarComercial";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || session.role !== "TECNICO") {
    return NextResponse.json({ error: "Solo el técnico asignado puede programar la visita." }, { status: 403 });
  }

  const incidencia = await prisma.incidencia.findUnique({ where: { id: params.id } });
  if (!incidencia) return NextResponse.json({ error: "Incidencia no encontrada." }, { status: 404 });
  if (incidencia.tecnicoId !== session.userId) {
    return NextResponse.json({ error: "Esta incidencia no está asignada a tu cuenta." }, { status: 403 });
  }
  if (incidencia.estado !== "ASIGNADA") {
    return NextResponse.json({ error: "Solo se puede programar una visita mientras está en estado 'Asignada'." }, { status: 409 });
  }

  const body = await req.json().catch(() => null);
  const fechaHora = body?.fechaHora;
  const fecha = fechaHora ? new Date(fechaHora) : null;
  if (!fecha || Number.isNaN(fecha.getTime())) {
    return NextResponse.json({ error: "Fecha y hora no válidas." }, { status: 400 });
  }

  const updated = await prisma.incidencia.update({
    where: { id: params.id },
    data: { fechaVisitaProgramada: fecha },
    include: { estanco: true, tecnico: true, fotos: true, materialesUsados: { include: { material: true } } },
  });

  // El aviso al comercial no debe bloquear la respuesta al técnico si el email tarda o falla.
  notificarComercial(params.id, "PROGRAMADA").catch((err) =>
    console.error("[notificar-comercial] Error avisando de la visita programada:", err)
  );

  await syncToSheets(["incidencias", "intervenciones", "censo"]);

  return NextResponse.json({ incidencia: updated });
}
