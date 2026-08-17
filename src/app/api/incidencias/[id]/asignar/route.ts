import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { syncToSheets } from "@/lib/googleSheets";
import { crearNotificacion } from "@/lib/notificaciones";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || session.role !== "ADMIRA") {
    return NextResponse.json({ error: "Solo Admira puede asignar técnico." }, { status: 403 });
  }

  const incidencia = await prisma.incidencia.findUnique({ where: { id: params.id } });
  if (!incidencia) return NextResponse.json({ error: "Incidencia no encontrada." }, { status: 404 });
  if (incidencia.estado !== "SIN_ASIGNAR") {
    return NextResponse.json({ error: "Esta incidencia ya tiene técnico asignado." }, { status: 409 });
  }

  const body = await req.json().catch(() => null);
  const tecnicoId = body?.tecnicoId;
  if (!tecnicoId) return NextResponse.json({ error: "Selecciona un técnico." }, { status: 400 });

  const tecnico = await prisma.user.findUnique({ where: { id: tecnicoId } });
  if (!tecnico || tecnico.role !== "TECNICO") {
    return NextResponse.json({ error: "Técnico no válido." }, { status: 400 });
  }

  const updated = await prisma.incidencia.update({
    where: { id: params.id },
    data: {
      tecnicoId,
      estado: "ASIGNADA",
      fechaAsignacion: new Date(),
      creadoPorId: session.userId,
    },
    include: { tecnico: true },
  });

  await syncToSheets(["incidencias", "tecnicos", "intervenciones", "censo"]);

  await crearNotificacion({
    userId: tecnicoId,
    tipo: "INCIDENCIA_ASIGNADA",
    titulo: "Nueva incidencia asignada",
    mensaje: updated.titulo,
    entidadTipo: "incidencia",
    entidadId: updated.id,
  });

  return NextResponse.json({ incidencia: updated });
}
