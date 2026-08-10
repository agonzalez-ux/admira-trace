import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { calcularProximaEjecucion } from "@/lib/ordenesRecurrentes";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || session.role !== "ADMIRA") {
    return NextResponse.json({ error: "Solo Admira puede editar órdenes recurrentes." }, { status: 403 });
  }

  const orden = await prisma.ordenRecurrente.findUnique({ where: { id: params.id } });
  if (!orden) return NextResponse.json({ error: "Orden no encontrada." }, { status: 404 });

  const body = await req.json().catch(() => null);
  const { frecuenciaDias, transportista, materialConfig, notas, activa } = body || {};

  const data: any = {};
  if (frecuenciaDias !== undefined) {
    const dias = Number(frecuenciaDias);
    if (!dias || dias < 1) return NextResponse.json({ error: "Frecuencia no válida." }, { status: 400 });
    data.frecuenciaDias = dias;
    // Al cambiar la frecuencia se recalcula la próxima ejecución desde la última
    // (o desde ahora si nunca se ha ejecutado), para que el cambio surta efecto ya.
    data.proximaEjecucion = calcularProximaEjecucion(orden.ultimaEjecucion || new Date(), dias);
  }
  if (transportista !== undefined) data.transportista = transportista;
  if (notas !== undefined) data.notas = notas || null;
  if (activa !== undefined) data.activa = Boolean(activa);
  if (materialConfig !== undefined) {
    if (!Array.isArray(materialConfig)) {
      return NextResponse.json({ error: "Configuración de material no válida." }, { status: 400 });
    }
    const limpio = materialConfig
      .filter((i: any) => i?.tipo && Number(i.cantidad) > 0)
      .map((i: any) => ({ tipo: String(i.tipo), cantidad: Number(i.cantidad) }));
    if (limpio.length === 0) {
      return NextResponse.json({ error: "Indica al menos un tipo de material con cantidad." }, { status: 400 });
    }
    data.materialConfig = JSON.stringify(limpio);
  }

  const actualizada = await prisma.ordenRecurrente.update({
    where: { id: params.id },
    data,
    include: { tecnico: true },
  });

  return NextResponse.json({ orden: actualizada });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || session.role !== "ADMIRA") {
    return NextResponse.json({ error: "Solo Admira puede eliminar órdenes recurrentes." }, { status: 403 });
  }

  const orden = await prisma.ordenRecurrente.findUnique({
    where: { id: params.id },
    include: { envios: { select: { id: true } } },
  });
  if (!orden) return NextResponse.json({ error: "Orden no encontrada." }, { status: 404 });

  // Si ya generó envíos, no se borra (rompería su trazabilidad): se desactiva,
  // que a efectos prácticos detiene la generación automática igual.
  if (orden.envios.length > 0) {
    await prisma.ordenRecurrente.update({ where: { id: params.id }, data: { activa: false } });
    return NextResponse.json({
      ok: true,
      desactivada: true,
      mensaje: `La orden ya había generado ${orden.envios.length} envío(s), así que se ha desactivado en vez de borrarla para no perder su historial.`,
    });
  }

  await prisma.ordenRecurrente.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true, eliminada: true });
}
