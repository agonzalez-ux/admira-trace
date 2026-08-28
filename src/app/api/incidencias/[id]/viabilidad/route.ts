import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { syncToSheets } from "@/lib/googleSheets";
import { actualizarFilaViabilidadEnExcel } from "@/lib/viabilidadExcel";
import { solicitarViabilidadComercial } from "@/lib/viabilidad";

/**
 * Revisión manual de la viabilidad de una instalación, tras la respuesta del
 * comercial. Solo Admira puede decidir, o pedir que se reenvíe el formulario.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || session.role !== "ADMIRA") {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  const incidencia = await prisma.incidencia.findUnique({ where: { id: params.id } });
  if (!incidencia) return NextResponse.json({ error: "Incidencia no encontrada." }, { status: 404 });

  const body = await req.json().catch(() => null);
  const { accion } = body || {};

  if (accion === "reenviar") {
    await solicitarViabilidadComercial(params.id);
    return NextResponse.json({ ok: true });
  }

  if (accion === "decidir") {
    const { decision } = body || {};
    if (!["VIABLE", "NO_VIABLE"].includes(decision)) {
      return NextResponse.json({ error: "Decisión no válida." }, { status: 400 });
    }

    const actualizada = await prisma.incidencia.update({
      where: { id: params.id },
      data: { viabilidadEstado: decision },
    });

    if (actualizada.viabilidadExcelFileId && actualizada.viabilidadExcelFila) {
      const respuesta = await prisma.viabilidadRespuesta.findUnique({ where: { incidenciaId: params.id } });
      if (respuesta) {
        actualizarFilaViabilidadEnExcel(actualizada.viabilidadExcelFileId, actualizada.viabilidadExcelFila, {
          materialConfirmado: respuesta.materialConfirmado,
          materialCorreccion: respuesta.materialCorreccion,
          tipoUbicacion: respuesta.tipoUbicacion,
          medidas:
            respuesta.tipoUbicacion === "HUECO"
              ? `${respuesta.medidasAncho ?? "?"} x ${respuesta.medidasAlto ?? "?"} x ${respuesta.medidasFondo ?? "?"} cm`
              : null,
          puntosElectricosCercanos: respuesta.puntosElectricosCercanos,
          puntosElectricosComentario: respuesta.puntosElectricosComentario,
          sePuedeTaladrar: respuesta.sePuedeTaladrar,
          comentarios: respuesta.comentarios,
          respondidoPorNombre: respuesta.respondidoPorNombre,
          fechaRespuesta: respuesta.respondidoEn,
          estadoViabilidad: decision === "VIABLE" ? "Viable" : "No viable",
        }).catch((err) => console.error("[incidencias/viabilidad] Error actualizando el Excel de origen:", err));
      }
    }

    await syncToSheets(["incidencias", "censo"]);

    return NextResponse.json({ incidencia: actualizada });
  }

  return NextResponse.json({ error: "Acción no reconocida." }, { status: 400 });
}
