import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { ejecutarLimpiezaMensual, segundosHastaProximoReset } from "@/lib/cleanupScheduler";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/admin/cleanup
 * Ejecuta manualmente la limpieza de fotos de incidencias resueltas.
 * Solo ADMIRA puede hacerlo.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "ADMIRA") {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  try {
    const inicio = Date.now();
    const resultado = await ejecutarLimpiezaMensual();
    const duracion = Math.floor((Date.now() - inicio) / 1000);

    // Registrar en BD
    await prisma.cleanupLog.create({
      data: {
        fotosMovidas: resultado.fotosMovidas,
        fotosEliminadas: resultado.fotosEliminadas,
        backupsLimpiados: resultado.backupsLimpiados,
        erroresCount: resultado.errores.length,
        detalles: resultado.errores.length > 0 ? JSON.stringify(resultado.errores) : null,
        tiempoEjecucion: duracion,
      },
    });

    return NextResponse.json({
      ok: true,
      mensaje: "Limpieza completada",
      resultado: {
        fotosMovidas: resultado.fotosMovidas,
        fotosEliminadas: resultado.fotosEliminadas,
        backupsLimpiados: resultado.backupsLimpiados,
        errores: resultado.errores,
        duracion: `${duracion}s`,
      },
    });
  } catch (err) {
    console.error("[cleanup/route] Error:", err);
    return NextResponse.json(
      { error: "Error ejecutando limpieza: " + (err instanceof Error ? err.message : "desconocido") },
      { status: 500 }
    );
  }
}

/**
 * GET /api/admin/cleanup/status
 * Muestra el próximo reset programado y el historial de limpiezas.
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "ADMIRA") {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  try {
    const proximoEnSegundos = segundosHastaProximoReset();
    const horas = Math.floor(proximoEnSegundos / 3600);
    const minutos = Math.floor((proximoEnSegundos % 3600) / 60);

    // Últimas 5 limpiezas
    const historial = await prisma.cleanupLog.findMany({
      orderBy: { ejecutadoEn: "desc" },
      take: 5,
    });

    return NextResponse.json({
      proximoReset: {
        tiempoRestante: `${horas}h ${minutos}m`,
        segundos: proximoEnSegundos,
      },
      historial: historial.map((log) => ({
        id: log.id,
        fecha: log.ejecutadoEn.toISOString(),
        fotosMovidas: log.fotosMovidas,
        fotosEliminadas: log.fotosEliminadas,
        backupsLimpiados: log.backupsLimpiados,
        duracion: log.tiempoEjecucion ? `${log.tiempoEjecucion}s` : "—",
        errores: log.erroresCount > 0 ? log.erroresCount : 0,
      })),
    });
  } catch (err) {
    console.error("[cleanup/status] Error:", err);
    return NextResponse.json(
      { error: "Error obteniendo estado: " + (err instanceof Error ? err.message : "desconocido") },
      { status: 500 }
    );
  }
}
