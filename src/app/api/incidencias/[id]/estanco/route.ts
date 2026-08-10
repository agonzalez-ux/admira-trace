import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { syncToSheets } from "@/lib/googleSheets";

/**
 * Vincula (o desvincula) a mano el estanco de una incidencia, para los casos
 * en que el emparejador automático del desk no lo encontró. Se marca con
 * confianza 1 (máxima) porque lo ha confirmado una persona, no el algoritmo.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || session.role !== "ADMIRA") {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  const incidencia = await prisma.incidencia.findUnique({ where: { id: params.id } });
  if (!incidencia) return NextResponse.json({ error: "Incidencia no encontrada." }, { status: 404 });

  const body = await req.json().catch(() => null);
  const estancoId = body?.estancoId ?? null;

  if (estancoId) {
    const estanco = await prisma.estanco.findUnique({ where: { id: estancoId } });
    if (!estanco) return NextResponse.json({ error: "Estanco no encontrado." }, { status: 404 });
  }

  const updated = await prisma.incidencia.update({
    where: { id: params.id },
    data: {
      estancoId,
      estancoMatchConfianza: estancoId ? 1 : null,
    },
    include: { estanco: true, tecnico: true, fotos: true, materialesUsados: { include: { material: true } } },
  });

  await syncToSheets("incidencias");

  return NextResponse.json({ incidencia: updated });
}
